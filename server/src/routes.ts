import { Prisma, ProjectStatus, SprintStatus, TaskPriority, TaskType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { hashPassword, hashToken, signAccessToken, signRefreshToken, verifyPassword } from "./auth.js";
import { prisma } from "./db.js";
import { requireAuth, requireOrganization } from "./middleware.js";
import { hasRole } from "./rbac.js";
import { AIProvider, calculateProjectHealth, createProjectPlan, createRetrospective, createSprintSummary, createStandup, createTaskBreakdown, getPermittedWorkspaceContext, prioritizeTasks } from "./ai.js";
import { buildProjectReport, searchItems, SearchItem } from "./phase6.js";
import { billingPlans, canUseAi, redactSecret, securityChecklist, summarizeAiUsage, validateUpload } from "./phase7.js";

export const router = Router();

const signupSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), workspaceName: z.string().min(2).optional() });
const workflowStatuses = ["Backlog", "Todo", "In Progress", "In Review", "QA", "Done"];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function projectKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

async function requireProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organization: { members: { some: { userId } } } }
  });
  return project;
}

async function requireTaskAccess(taskId: string, userId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, project: { organization: { members: { some: { userId } } } } },
    include: { project: true }
  });
}

async function writeActivity(input: { organizationId: string; userId: string; action: string; entityType: string; entityId: string; oldValue?: Prisma.InputJsonValue; newValue?: Prisma.InputJsonValue }) {
  await prisma.activityLog.create({ data: input });
}

router.get("/health", (_req, res) => res.json({ ok: true, service: "taskpilot-api" }));

router.post("/auth/signup", async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const user = await prisma.user.create({ data: { name: input.name, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password) } });
    const organization = await prisma.organization.create({ data: { name: input.workspaceName ?? `${input.name}'s Workspace`, slug: `${slugify(input.workspaceName ?? input.name)}-${Date.now()}`, members: { create: { userId: user.id, role: "OWNER" } } } });
    const refreshToken = signRefreshToken(user);
    await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, organization, accessToken: signAccessToken(user), refreshToken });
  } catch (error) { next(error); }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) return res.status(401).json({ error: "Invalid credentials" });
    const refreshToken = signRefreshToken(user);
    await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return res.json({ user: { id: user.id, email: user.email, name: user.name }, accessToken: signAccessToken(user), refreshToken });
  } catch (error) { return next(error); }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, name: true, organizationMembers: { include: { organization: true } } } });
  res.json({ user });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  const token = z.object({ refreshToken: z.string() }).parse(req.body).refreshToken;
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token), userId: req.user!.id }, data: { revokedAt: new Date() } });
  res.status(204).send();
});

router.post("/auth/forgot-password", (_req, res) => res.json({ message: "If the account exists, password reset instructions will be sent." }));
router.post("/auth/reset-password", (_req, res) => res.status(501).json({ error: "Password reset token flow is reserved for the email provider integration phase." }));
router.post("/auth/verify-email", (_req, res) => res.status(501).json({ error: "Email verification delivery is reserved for the email provider integration phase." }));

router.get("/organizations", requireAuth, async (req, res) => {
  const memberships = await prisma.organizationMember.findMany({ where: { userId: req.user!.id }, include: { organization: true }, orderBy: { createdAt: "asc" } });
  res.json({ organizations: memberships.map(({ organization, role }) => ({ ...organization, role })) });
});

router.post("/organizations", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().min(2) }).parse(req.body);
    const organization = await prisma.organization.create({ data: { name: input.name, slug: `${slugify(input.name)}-${Date.now()}`, members: { create: { userId: req.user!.id, role: "OWNER" } } } });
    res.status(201).json({ organization });
  } catch (error) { next(error); }
});

router.get("/organizations/:organizationId/members", requireAuth, requireOrganization("VIEWER"), async (req, res) => {
  const members = await prisma.organizationMember.findMany({ where: { organizationId: req.membership!.organizationId }, include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }, orderBy: { createdAt: "asc" } });
  res.json({ members });
});

const projectSchema = z.object({
  name: z.string().min(2),
  key: z.string().min(2).max(8).optional(),
  description: z.string().max(5000).optional(),
  color: z.string().optional(),
  methodology: z.enum(["SCRUM", "KANBAN", "SIMPLE"]).default("SCRUM"),
  status: z.nativeEnum(ProjectStatus).default("PLANNING"),
  targetDate: z.string().datetime().optional()
});

router.get("/organizations/:organizationId/projects", requireAuth, requireOrganization("VIEWER"), async (req, res) => {
  const projects = await prisma.project.findMany({
    where: { organizationId: req.membership!.organizationId, status: { not: "ARCHIVED" } },
    include: { _count: { select: { tasks: true, members: true } } },
    orderBy: { updatedAt: "desc" }
  });
  res.json({ projects });
});

router.post("/organizations/:organizationId/projects", requireAuth, requireOrganization("PROJECT_MANAGER"), async (req, res, next) => {
  try {
    const input = projectSchema.parse(req.body);
    const project = await prisma.project.create({
      data: {
        organizationId: req.membership!.organizationId,
        managerId: req.user!.id,
        name: input.name,
        key: projectKey(input.key ?? input.name),
        description: input.description,
        color: input.color ?? "#5b5ee6",
        methodology: input.methodology,
        status: input.status,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
        members: { create: { userId: req.user!.id, role: req.membership!.role } }
      }
    });
    await writeActivity({ organizationId: project.organizationId, userId: req.user!.id, action: "PROJECT_CREATED", entityType: "Project", entityId: project.id, newValue: project as unknown as Prisma.InputJsonValue });
    res.status(201).json({ project });
  } catch (error) { next(error); }
});

router.get("/projects/:projectId", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const tasks = await prisma.task.findMany({ where: { projectId: project.id, organizationId: project.organizationId }, include: { assignee: { select: { id: true, name: true, email: true } }, reporter: { select: { id: true, name: true, email: true } }, comments: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  res.json({ project, tasks, workflowStatuses });
});

router.patch("/projects/:projectId", requireAuth, async (req, res, next) => {
  try {
    const project = await requireProjectAccess(req.params.projectId, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: project.organizationId, userId: req.user!.id } } });
    if (!membership || !hasRole(membership.role, "PROJECT_MANAGER")) return res.status(403).json({ error: "Insufficient project permissions" });
    const input = projectSchema.partial().parse(req.body);
    const updated = await prisma.project.update({ where: { id: project.id }, data: { ...input, key: input.key ? projectKey(input.key) : undefined, targetDate: input.targetDate ? new Date(input.targetDate) : undefined } });
    await writeActivity({ organizationId: project.organizationId, userId: req.user!.id, action: "PROJECT_UPDATED", entityType: "Project", entityId: project.id, oldValue: project as unknown as Prisma.InputJsonValue, newValue: updated as unknown as Prisma.InputJsonValue });
    return res.json({ project: updated });
  } catch (error) { return next(error); }
});

router.delete("/projects/:projectId", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const updated = await prisma.project.update({ where: { id: project.id }, data: { status: "ARCHIVED" } });
  await writeActivity({ organizationId: project.organizationId, userId: req.user!.id, action: "PROJECT_ARCHIVED", entityType: "Project", entityId: project.id, oldValue: project as unknown as Prisma.InputJsonValue, newValue: updated as unknown as Prisma.InputJsonValue });
  return res.status(204).send();
});

const taskSchema = z.object({
  title: z.string().min(2),
  description: z.string().max(10000).optional(),
  type: z.nativeEnum(TaskType).default("TASK"),
  status: z.string().default("Todo"),
  priority: z.nativeEnum(TaskPriority).default("NO_PRIORITY"),
  assigneeId: z.string().uuid().optional(),
  storyPoints: z.number().int().min(0).max(100).optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().optional()
});

router.get("/projects/:projectId/tasks", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const tasks = await prisma.task.findMany({ where: { projectId: project.id, organizationId: project.organizationId }, include: { assignee: { select: { id: true, name: true, email: true } }, reporter: { select: { id: true, name: true, email: true } }, comments: { include: { author: { select: { id: true, name: true } } } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  res.json({ tasks, workflowStatuses });
});

router.post("/projects/:projectId/tasks", requireAuth, async (req, res, next) => {
  try {
    const project = await requireProjectAccess(req.params.projectId, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const input = taskSchema.parse(req.body);
    const task = await prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({ where: { id: project.id }, data: { taskSequence: { increment: 1 } } });
      return tx.task.create({ data: { organizationId: project.organizationId, projectId: project.id, taskKey: `${project.key}-${updatedProject.taskSequence}`, title: input.title, description: input.description, type: input.type, status: input.status, priority: input.priority, assigneeId: input.assigneeId, reporterId: req.user!.id, storyPoints: input.storyPoints, dueDate: input.dueDate ? new Date(input.dueDate) : undefined, startDate: input.startDate ? new Date(input.startDate) : undefined, sprintId: input.sprintId, epicId: input.epicId, parentTaskId: input.parentTaskId } });
    });
    await writeActivity({ organizationId: project.organizationId, userId: req.user!.id, action: "TASK_CREATED", entityType: "Task", entityId: task.id, newValue: task as unknown as Prisma.InputJsonValue });
    res.status(201).json({ task });
  } catch (error) { next(error); }
});

router.get("/tasks/:taskId", requireAuth, async (req, res) => {
  const task = await requireTaskAccess(req.params.taskId, req.user!.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const detail = await prisma.task.findUnique({ where: { id: task.id }, include: { assignee: { select: { id: true, name: true, email: true } }, reporter: { select: { id: true, name: true, email: true } }, comments: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }, subtasks: true, dependenciesAsBlocked: true, dependenciesAsBlocking: true } });
  res.json({ task: detail });
});

router.patch("/tasks/:taskId", requireAuth, async (req, res, next) => {
  try {
    const task = await requireTaskAccess(req.params.taskId, req.user!.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const input = taskSchema.partial().extend({ sortOrder: z.number().int().optional(), blocked: z.boolean().optional() }).parse(req.body);
    const updated = await prisma.task.update({ where: { id: task.id }, data: { ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined, startDate: input.startDate ? new Date(input.startDate) : undefined } });
    await writeActivity({ organizationId: task.organizationId, userId: req.user!.id, action: "TASK_UPDATED", entityType: "Task", entityId: task.id, oldValue: task as unknown as Prisma.InputJsonValue, newValue: updated as unknown as Prisma.InputJsonValue });
    res.json({ task: updated });
  } catch (error) { next(error); }
});

router.delete("/tasks/:taskId", requireAuth, async (req, res) => {
  const task = await requireTaskAccess(req.params.taskId, req.user!.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  await prisma.task.delete({ where: { id: task.id } });
  await writeActivity({ organizationId: task.organizationId, userId: req.user!.id, action: "TASK_DELETED", entityType: "Task", entityId: task.id, oldValue: task as unknown as Prisma.InputJsonValue });
  res.status(204).send();
});

router.post("/tasks/:taskId/comments", requireAuth, async (req, res, next) => {
  try {
    const task = await requireTaskAccess(req.params.taskId, req.user!.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const input = z.object({ body: z.string().min(1).max(5000) }).parse(req.body);
    const comment = await prisma.comment.create({ data: { taskId: task.id, authorId: req.user!.id, body: input.body }, include: { author: { select: { id: true, name: true } } } });
    await writeActivity({ organizationId: task.organizationId, userId: req.user!.id, action: "COMMENT_CREATED", entityType: "Comment", entityId: comment.id, newValue: comment as unknown as Prisma.InputJsonValue });
    res.status(201).json({ comment });
  } catch (error) { next(error); }
});

router.get("/organizations/:organizationId/activity", requireAuth, requireOrganization("VIEWER"), async (req, res) => {
  const activity = await prisma.activityLog.findMany({ where: { organizationId: req.membership!.organizationId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ activity });
});


const epicSchema = z.object({ name: z.string().min(2), description: z.string().max(5000).optional() });
const sprintSchema = z.object({
  name: z.string().min(2),
  goal: z.string().max(5000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.nativeEnum(SprintStatus).default("PLANNED")
});

router.get("/projects/:projectId/epics", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const epics = await prisma.epic.findMany({ where: { projectId: project.id, organizationId: project.organizationId }, include: { tasks: { select: { id: true, taskKey: true, title: true, status: true, storyPoints: true, startDate: true, dueDate: true } } }, orderBy: { name: "asc" } });
  res.json({ epics });
});

router.post("/projects/:projectId/epics", requireAuth, async (req, res, next) => {
  try {
    const project = await requireProjectAccess(req.params.projectId, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const input = epicSchema.parse(req.body);
    const epic = await prisma.epic.create({ data: { organizationId: project.organizationId, projectId: project.id, name: input.name, description: input.description } });
    await writeActivity({ organizationId: project.organizationId, userId: req.user!.id, action: "EPIC_CREATED", entityType: "Epic", entityId: epic.id, newValue: epic as unknown as Prisma.InputJsonValue });
    res.status(201).json({ epic });
  } catch (error) { next(error); }
});

router.patch("/epics/:epicId", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.epic.findFirst({ where: { id: req.params.epicId, project: { organization: { members: { some: { userId: req.user!.id } } } } } });
    if (!existing) return res.status(404).json({ error: "Epic not found" });
    const input = epicSchema.partial().parse(req.body);
    const epic = await prisma.epic.update({ where: { id: existing.id }, data: input });
    await writeActivity({ organizationId: existing.organizationId, userId: req.user!.id, action: "EPIC_UPDATED", entityType: "Epic", entityId: epic.id, oldValue: existing as unknown as Prisma.InputJsonValue, newValue: epic as unknown as Prisma.InputJsonValue });
    res.json({ epic });
  } catch (error) { next(error); }
});

router.get("/projects/:projectId/sprints", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const sprints = await prisma.sprint.findMany({ where: { projectId: project.id, organizationId: project.organizationId }, include: { tasks: { select: { id: true, taskKey: true, title: true, status: true, storyPoints: true, assignee: { select: { id: true, name: true } } } } }, orderBy: [{ status: "asc" }, { startDate: "asc" }] });
  res.json({ sprints });
});

router.post("/projects/:projectId/sprints", requireAuth, async (req, res, next) => {
  try {
    const project = await requireProjectAccess(req.params.projectId, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const input = sprintSchema.parse(req.body);
    const sprint = await prisma.sprint.create({ data: { organizationId: project.organizationId, projectId: project.id, name: input.name, goal: input.goal, startDate: input.startDate ? new Date(input.startDate) : undefined, endDate: input.endDate ? new Date(input.endDate) : undefined, status: input.status } });
    await writeActivity({ organizationId: project.organizationId, userId: req.user!.id, action: "SPRINT_CREATED", entityType: "Sprint", entityId: sprint.id, newValue: sprint as unknown as Prisma.InputJsonValue });
    res.status(201).json({ sprint });
  } catch (error) { next(error); }
});

router.patch("/sprints/:sprintId", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.sprint.findFirst({ where: { id: req.params.sprintId, project: { organization: { members: { some: { userId: req.user!.id } } } } } });
    if (!existing) return res.status(404).json({ error: "Sprint not found" });
    const input = sprintSchema.partial().parse(req.body);
    const sprint = await prisma.sprint.update({ where: { id: existing.id }, data: { ...input, startDate: input.startDate ? new Date(input.startDate) : undefined, endDate: input.endDate ? new Date(input.endDate) : undefined } });
    await writeActivity({ organizationId: existing.organizationId, userId: req.user!.id, action: "SPRINT_UPDATED", entityType: "Sprint", entityId: sprint.id, oldValue: existing as unknown as Prisma.InputJsonValue, newValue: sprint as unknown as Prisma.InputJsonValue });
    res.json({ sprint });
  } catch (error) { next(error); }
});

router.post("/sprints/:sprintId/complete", requireAuth, async (req, res) => {
  const existing = await prisma.sprint.findFirst({ where: { id: req.params.sprintId, project: { organization: { members: { some: { userId: req.user!.id } } } } } });
  if (!existing) return res.status(404).json({ error: "Sprint not found" });
  const sprint = await prisma.sprint.update({ where: { id: existing.id }, data: { status: "COMPLETED" } });
  await writeActivity({ organizationId: existing.organizationId, userId: req.user!.id, action: "SPRINT_COMPLETED", entityType: "Sprint", entityId: sprint.id, oldValue: existing as unknown as Prisma.InputJsonValue, newValue: sprint as unknown as Prisma.InputJsonValue });
  res.json({ sprint });
});

router.get("/projects/:projectId/backlog", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const [sprints, backlog] = await Promise.all([
    prisma.sprint.findMany({ where: { projectId: project.id, organizationId: project.organizationId, status: { not: "COMPLETED" } }, include: { tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }, orderBy: { startDate: "asc" } }),
    prisma.task.findMany({ where: { projectId: project.id, organizationId: project.organizationId, sprintId: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
  ]);
  res.json({ currentSprint: sprints.find((sprint) => sprint.status === "ACTIVE") ?? null, futureSprints: sprints.filter((sprint) => sprint.status === "PLANNED"), backlog });
});

router.post("/tasks/:taskId/move-to-sprint", requireAuth, async (req, res, next) => {
  try {
    const task = await requireTaskAccess(req.params.taskId, req.user!.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const input = z.object({ sprintId: z.string().uuid().nullable(), sortOrder: z.number().int().optional() }).parse(req.body);
    if (input.sprintId) {
      const sprint = await prisma.sprint.findFirst({ where: { id: input.sprintId, projectId: task.projectId, organizationId: task.organizationId } });
      if (!sprint) return res.status(404).json({ error: "Sprint not found in task project" });
    }
    const updated = await prisma.task.update({ where: { id: task.id }, data: { sprintId: input.sprintId, sortOrder: input.sortOrder } });
    await writeActivity({ organizationId: task.organizationId, userId: req.user!.id, action: "TASK_MOVED_TO_SPRINT", entityType: "Task", entityId: task.id, oldValue: task as unknown as Prisma.InputJsonValue, newValue: updated as unknown as Prisma.InputJsonValue });
    res.json({ task: updated });
  } catch (error) { next(error); }
});

router.get("/projects/:projectId/roadmap", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const epics = await prisma.epic.findMany({ where: { projectId: project.id, organizationId: project.organizationId }, include: { tasks: { select: { id: true, taskKey: true, title: true, status: true, startDate: true, dueDate: true } } }, orderBy: { name: "asc" } });
  const milestones = await prisma.sprint.findMany({ where: { projectId: project.id, organizationId: project.organizationId }, select: { id: true, name: true, startDate: true, endDate: true, status: true }, orderBy: { startDate: "asc" } });
  res.json({ epics, milestones });
});

router.get("/projects/:projectId/calendar", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const [tasks, sprints] = await Promise.all([
    prisma.task.findMany({ where: { projectId: project.id, organizationId: project.organizationId, dueDate: { not: null } }, select: { id: true, taskKey: true, title: true, dueDate: true, priority: true, status: true }, orderBy: { dueDate: "asc" } }),
    prisma.sprint.findMany({ where: { projectId: project.id, organizationId: project.organizationId }, select: { id: true, name: true, startDate: true, endDate: true, status: true }, orderBy: { startDate: "asc" } })
  ]);
  res.json({ events: [...tasks.map((task) => ({ type: "task_due", id: task.id, title: `${task.taskKey} ${task.title}`, date: task.dueDate, status: task.status, priority: task.priority })), ...sprints.flatMap((sprint) => [{ type: "sprint_start", id: sprint.id, title: `${sprint.name} starts`, date: sprint.startDate, status: sprint.status }, { type: "sprint_end", id: sprint.id, title: `${sprint.name} ends`, date: sprint.endDate, status: sprint.status }]).filter((event) => event.date)] });
});


const aiProvider = new AIProvider({ apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.AI_BASE_URL, model: process.env.AI_MODEL });

router.post("/ai/chat", requireAuth, requireOrganization("VIEWER"), async (req, res, next) => {
  try {
    const input = z.object({ message: z.string().min(1).max(4000), conversationId: z.string().uuid().optional() }).parse(req.body);
    const context = await getPermittedWorkspaceContext(prisma, req.membership!.organizationId, req.user!.id);
    const toolCalls = [{ name: "getWorkspaceContext", arguments: { organizationId: req.membership!.organizationId }, result: context }];
    const conversation = input.conversationId
      ? await prisma.aIConversation.findFirst({ where: { id: input.conversationId, userId: req.user!.id } })
      : await prisma.aIConversation.create({ data: { userId: req.user!.id, title: input.message.slice(0, 80) } });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "user", content: input.message } });
    const ai = await aiProvider.chat([
      { role: "system", content: "You are TaskPilot AI. Use only provided tool data. Do not fabricate project, sprint, or task details. Do not claim you changed data." },
      { role: "user", content: `${input.message}\n\nTool data:\n${JSON.stringify(context)}` }
    ], toolCalls);
    const message = await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: ai.content, toolCalls: toolCalls as unknown as Prisma.InputJsonValue } });
    await prisma.aIUsage.create({ data: { organizationId: req.membership!.organizationId, userId: req.user!.id, feature: "ai_chat", model: ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, estimatedCostCents: ai.model === "local-deterministic" ? 0 : Math.ceil((ai.inputTokens + ai.outputTokens) / 1000), toolCalls: toolCalls as unknown as Prisma.InputJsonValue } });
    res.json({ conversationId: conversation.id, message });
  } catch (error) { next(error); }
});

router.post("/ai/plan", requireAuth, requireOrganization("VIEWER"), async (req, res, next) => {
  try {
    const input = z.object({ requirement: z.string().min(10).max(8000) }).parse(req.body);
    const plan = createProjectPlan(input.requirement);
    const action = await prisma.aIAction.create({ data: { organizationId: req.membership!.organizationId, userId: req.user!.id, feature: "project_plan", proposal: plan as unknown as Prisma.InputJsonValue, status: "PROPOSED" } });
    await prisma.aIUsage.create({ data: { organizationId: req.membership!.organizationId, userId: req.user!.id, feature: "project_plan", model: "local-deterministic", inputTokens: Math.ceil(input.requirement.length / 4), outputTokens: Math.ceil(JSON.stringify(plan).length / 4), estimatedCostCents: 0 } });
    res.status(201).json({ actionId: action.id, plan });
  } catch (error) { next(error); }
});

router.post("/ai/task-breakdown", requireAuth, requireOrganization("VIEWER"), async (req, res, next) => {
  try {
    const input = z.object({ title: z.string().min(2).max(500), description: z.string().max(5000).optional() }).parse(req.body);
    const tasks = createTaskBreakdown(`${input.title} ${input.description ?? ""}`.trim());
    const proposal = { sourceTask: input.title, tasks };
    const action = await prisma.aIAction.create({ data: { organizationId: req.membership!.organizationId, userId: req.user!.id, feature: "task_breakdown", proposal: proposal as unknown as Prisma.InputJsonValue, status: "PROPOSED" } });
    res.status(201).json({ actionId: action.id, proposal });
  } catch (error) { next(error); }
});

router.post("/projects/:projectId/ai/task-draft", requireAuth, async (req, res, next) => {
  try {
    const project = await requireProjectAccess(req.params.projectId, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const input = z.object({ prompt: z.string().min(4).max(2000) }).parse(req.body);
    const tasks = createTaskBreakdown(input.prompt).map((task) => ({ ...task, status: "Todo", type: "TASK", projectId: project.id }));
    const proposal = { projectKey: project.key, prompt: input.prompt, tasks };
    const action = await prisma.aIAction.create({ data: { organizationId: project.organizationId, userId: req.user!.id, feature: "task_generation", proposal: proposal as unknown as Prisma.InputJsonValue, status: "PROPOSED" } });
    res.status(201).json({ actionId: action.id, proposal, confirmationRequired: true });
  } catch (error) { next(error); }
});



function serializePhase5Task(task: { taskKey: string; title: string; priority: TaskPriority; status: string; blocked: boolean; dueDate: Date | null; storyPoints: number | null; createdAt: Date }) {
  return { taskKey: task.taskKey, title: task.title, priority: task.priority, status: task.status, blocked: task.blocked, dueDate: task.dueDate, storyPoints: task.storyPoints, createdAt: task.createdAt };
}

router.post("/ai/prioritize", requireAuth, requireOrganization("VIEWER"), async (req, res, next) => {
  try {
    const input = z.object({ projectId: z.string().uuid().optional() }).parse(req.body);
    const where = input.projectId ? { projectId: input.projectId, organizationId: req.membership!.organizationId } : { organizationId: req.membership!.organizationId };
    if (input.projectId && !(await requireProjectAccess(input.projectId, req.user!.id))) return res.status(404).json({ error: "Project not found" });
    const tasks = await prisma.task.findMany({ where, orderBy: [{ dueDate: "asc" }, { priority: "asc" }], take: 100 });
    const recommendations = prioritizeTasks(tasks.map(serializePhase5Task));
    const proposal = { projectId: input.projectId ?? null, recommendations };
    const action = await prisma.aIAction.create({ data: { organizationId: req.membership!.organizationId, userId: req.user!.id, feature: "prioritization", proposal: proposal as unknown as Prisma.InputJsonValue, status: "PROPOSED" } });
    res.json({ actionId: action.id, recommendations, confirmationRequired: true });
  } catch (error) { next(error); }
});

router.post("/ai/project-health", requireAuth, requireOrganization("VIEWER"), async (req, res, next) => {
  try {
    const input = z.object({ projectId: z.string().uuid() }).parse(req.body);
    const project = await requireProjectAccess(input.projectId, req.user!.id);
    if (!project || project.organizationId !== req.membership!.organizationId) return res.status(404).json({ error: "Project not found" });
    const tasks = await prisma.task.findMany({ where: { projectId: project.id, organizationId: project.organizationId } });
    const health = calculateProjectHealth(tasks.map(serializePhase5Task));
    await prisma.aIUsage.create({ data: { organizationId: project.organizationId, userId: req.user!.id, feature: "project_health", model: "deterministic", inputTokens: tasks.length, outputTokens: Math.ceil(JSON.stringify(health).length / 4), estimatedCostCents: 0 } });
    res.json({ project: { id: project.id, key: project.key, name: project.name }, health });
  } catch (error) { next(error); }
});

router.post("/ai/standup", requireAuth, requireOrganization("VIEWER"), async (req, res, next) => {
  try {
    const input = z.object({ projectId: z.string().uuid().optional(), userId: z.string().uuid().optional() }).parse(req.body);
    const where = { organizationId: req.membership!.organizationId, ...(input.projectId ? { projectId: input.projectId } : {}), ...(input.userId ? { assigneeId: input.userId } : { assigneeId: req.user!.id }) };
    if (input.projectId && !(await requireProjectAccess(input.projectId, req.user!.id))) return res.status(404).json({ error: "Project not found" });
    const tasks = await prisma.task.findMany({ where, orderBy: { updatedAt: "desc" }, take: 50 });
    const user = await prisma.user.findUnique({ where: { id: input.userId ?? req.user!.id }, select: { name: true } });
    const standup = createStandup(tasks.map(serializePhase5Task), user?.name ?? "Team member");
    res.json({ standup, editable: true });
  } catch (error) { next(error); }
});

router.post("/ai/sprint-summary", requireAuth, requireOrganization("VIEWER"), async (req, res, next) => {
  try {
    const input = z.object({ sprintId: z.string().uuid() }).parse(req.body);
    const sprint = await prisma.sprint.findFirst({ where: { id: input.sprintId, organizationId: req.membership!.organizationId, project: { organization: { members: { some: { userId: req.user!.id } } } } }, include: { tasks: true } });
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });
    const summary = createSprintSummary(sprint.tasks.map(serializePhase5Task), sprint.name);
    res.json({ sprint: { id: sprint.id, name: sprint.name, status: sprint.status }, summary });
  } catch (error) { next(error); }
});

router.post("/ai/retrospective", requireAuth, requireOrganization("VIEWER"), async (req, res, next) => {
  try {
    const input = z.object({ sprintId: z.string().uuid() }).parse(req.body);
    const sprint = await prisma.sprint.findFirst({ where: { id: input.sprintId, organizationId: req.membership!.organizationId, project: { organization: { members: { some: { userId: req.user!.id } } } } }, include: { tasks: true } });
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });
    const retrospective = createRetrospective(sprint.tasks.map(serializePhase5Task));
    res.json({ sprint: { id: sprint.id, name: sprint.name }, retrospective });
  } catch (error) { next(error); }
});


const documentSchema = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  content: z.string().max(50000).optional(),
  sourceType: z.enum(["markdown", "txt", "pdf", "docx"]).default("markdown")
});

router.get("/organizations/:organizationId/documents", requireAuth, requireOrganization("VIEWER"), async (req, res) => {
  const documents = await prisma.document.findMany({ where: { organizationId: req.membership!.organizationId }, include: { project: { select: { id: true, key: true, name: true } } }, orderBy: { updatedAt: "desc" } });
  res.json({ documents });
});

router.post("/organizations/:organizationId/documents", requireAuth, requireOrganization("DEVELOPER"), async (req, res, next) => {
  try {
    const input = documentSchema.parse(req.body);
    if (input.projectId && !(await requireProjectAccess(input.projectId, req.user!.id))) return res.status(404).json({ error: "Project not found" });
    const document = await prisma.document.create({ data: { organizationId: req.membership!.organizationId, projectId: input.projectId, title: input.title, content: input.content, sourceType: input.sourceType } });
    await writeActivity({ organizationId: req.membership!.organizationId, userId: req.user!.id, action: "DOCUMENT_CREATED", entityType: "Document", entityId: document.id, newValue: document as unknown as Prisma.InputJsonValue });
    res.status(201).json({ document });
  } catch (error) { next(error); }
});

router.get("/documents/:documentId", requireAuth, async (req, res) => {
  const document = await prisma.document.findFirst({ where: { id: req.params.documentId, organization: { members: { some: { userId: req.user!.id } } } }, include: { project: { select: { id: true, key: true, name: true } } } });
  if (!document) return res.status(404).json({ error: "Document not found" });
  res.json({ document });
});

router.get("/organizations/:organizationId/search", requireAuth, requireOrganization("VIEWER"), async (req, res) => {
  const query = z.string().min(1).max(200).parse(req.query.q);
  const [projects, tasks, documents, comments, users] = await Promise.all([
    prisma.project.findMany({ where: { organizationId: req.membership!.organizationId, status: { not: "ARCHIVED" } }, take: 50 }),
    prisma.task.findMany({ where: { organizationId: req.membership!.organizationId }, take: 100 }),
    prisma.document.findMany({ where: { organizationId: req.membership!.organizationId }, take: 100 }),
    prisma.comment.findMany({ where: { task: { organizationId: req.membership!.organizationId } }, include: { task: { select: { taskKey: true, title: true } } }, take: 100 }),
    prisma.organizationMember.findMany({ where: { organizationId: req.membership!.organizationId }, include: { user: true }, take: 50 })
  ]);
  const items: SearchItem[] = [
    ...projects.map((project) => ({ type: "project", id: project.id, title: `${project.key} ${project.name}`, body: project.description })),
    ...tasks.map((task) => ({ type: "task", id: task.id, title: `${task.taskKey} ${task.title}`, body: task.description })),
    ...documents.map((document) => ({ type: "document", id: document.id, title: document.title, body: document.content })),
    ...comments.map((comment) => ({ type: "comment", id: comment.id, title: `${comment.task.taskKey} comment`, body: comment.body })),
    ...users.map((member) => ({ type: "user", id: member.user.id, title: member.user.name, body: member.user.email }))
  ];
  res.json({ query, results: searchItems(query, items).slice(0, 30), semantic: true });
});

router.get("/projects/:projectId/reports/summary", requireAuth, async (req, res) => {
  const project = await requireProjectAccess(req.params.projectId, req.user!.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const tasks = await prisma.task.findMany({ where: { projectId: project.id, organizationId: project.organizationId } });
  res.json({ project: { id: project.id, key: project.key, name: project.name }, report: buildProjectReport(tasks) });
});

router.get("/organizations/:organizationId/notifications", requireAuth, requireOrganization("VIEWER"), async (req, res) => {
  const notifications = await prisma.notification.findMany({ where: { organizationId: req.membership!.organizationId, userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ notifications });
});

router.patch("/notifications/:notificationId/read", requireAuth, async (req, res) => {
  const notification = await prisma.notification.findFirst({ where: { id: req.params.notificationId, userId: req.user!.id } });
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  res.json({ notification: updated });
});


const aiSettingsSchema = z.object({
  monthlyAiBudgetCents: z.number().int().min(0).max(10000000).optional(),
  aiDailyRequestLimit: z.number().int().min(1).max(100000).optional()
});

router.get("/organizations/:organizationId/billing/plans", requireAuth, requireOrganization("VIEWER"), (_req, res) => {
  res.json({ provider: "stripe-ready", plans: billingPlans, checkout: { enabled: Boolean(process.env.STRIPE_SECRET_KEY), publishableKeyConfigured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY) } });
});

router.get("/organizations/:organizationId/ai/usage", requireAuth, requireOrganization("ADMIN"), async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [organization, monthlyUsage, dailyRequests] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: req.membership!.organizationId } }),
    prisma.aIUsage.findMany({ where: { organizationId: req.membership!.organizationId, createdAt: { gte: startOfMonth } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.aIUsage.count({ where: { organizationId: req.membership!.organizationId, createdAt: { gte: startOfDay } } })
  ]);
  const summary = summarizeAiUsage(monthlyUsage);
  const control = canUseAi({ monthlyBudgetCents: organization.monthlyAiBudgetCents, dailyRequestLimit: organization.aiDailyRequestLimit, monthlySpendCents: summary.estimatedCostCents, dailyRequests });
  res.json({ period: { monthStart: startOfMonth, dayStart: startOfDay }, settings: { monthlyAiBudgetCents: organization.monthlyAiBudgetCents, aiDailyRequestLimit: organization.aiDailyRequestLimit }, control, summary, recentUsage: monthlyUsage.slice(0, 20) });
});

router.patch("/organizations/:organizationId/ai/settings", requireAuth, requireOrganization("ADMIN"), async (req, res, next) => {
  try {
    const input = aiSettingsSchema.parse(req.body);
    const before = await prisma.organization.findUniqueOrThrow({ where: { id: req.membership!.organizationId } });
    const organization = await prisma.organization.update({ where: { id: req.membership!.organizationId }, data: input });
    await writeActivity({ organizationId: organization.id, userId: req.user!.id, action: "AI_SETTINGS_UPDATED", entityType: "Organization", entityId: organization.id, oldValue: { monthlyAiBudgetCents: before.monthlyAiBudgetCents, aiDailyRequestLimit: before.aiDailyRequestLimit }, newValue: input });
    res.json({ organization: { id: organization.id, monthlyAiBudgetCents: organization.monthlyAiBudgetCents, aiDailyRequestLimit: organization.aiDailyRequestLimit } });
  } catch (error) { next(error); }
});

router.get("/organizations/:organizationId/security/checklist", requireAuth, requireOrganization("ADMIN"), (_req, res) => {
  res.json({ checklist: securityChecklist, environment: { stripeSecretKey: redactSecret(process.env.STRIPE_SECRET_KEY), jwtAccessSecret: redactSecret(process.env.JWT_ACCESS_SECRET), s3Bucket: process.env.S3_BUCKET ? "configured" : "not_configured" } });
});

router.get("/organizations/:organizationId/audit-logs", requireAuth, requireOrganization("ADMIN"), async (req, res) => {
  const logs = await prisma.activityLog.findMany({ where: { organizationId: req.membership!.organizationId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ logs });
});

router.post("/organizations/:organizationId/uploads/validate", requireAuth, requireOrganization("DEVELOPER"), (req, res) => {
  const input = z.object({ fileName: z.string(), mimeType: z.string(), sizeBytes: z.number().int() }).parse(req.body);
  res.json({ upload: validateUpload(input) });
});
