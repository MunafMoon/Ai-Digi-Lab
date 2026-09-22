import { PrismaClient } from "@prisma/client";

export type AIChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AIToolCall = { name: string; arguments: Record<string, unknown>; result?: unknown };
export type AIResponse = { content: string; model: string; inputTokens: number; outputTokens: number; toolCalls: AIToolCall[] };

type ProviderOptions = { apiKey?: string; baseUrl?: string; model?: string };

export class AIProvider {
  private apiKey?: string;
  private baseUrl: string;
  private model: string;

  constructor(options: ProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.model = options.model ?? "gpt-4.1-mini";
  }

  async chat(messages: AIChatMessage[], toolCalls: AIToolCall[] = []): Promise<AIResponse> {
    const promptText = messages.map((message) => message.content).join("\n");
    if (!this.apiKey) return this.localResponse(promptText, toolCalls);

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.2 })
    });

    if (!response.ok) return this.localResponse(promptText, toolCalls);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return {
      content: data.choices?.[0]?.message?.content ?? "I could not generate a response.",
      model: this.model,
      inputTokens: data.usage?.prompt_tokens ?? estimateTokens(promptText),
      outputTokens: data.usage?.completion_tokens ?? 0,
      toolCalls
    };
  }

  private localResponse(promptText: string, toolCalls: AIToolCall[]): AIResponse {
    const evidence = toolCalls.map((call) => `- ${call.name}: ${summarizeResult(call.result)}`).join("\n");
    const content = evidence
      ? `I reviewed live workspace data through permitted tools.\n\n${evidence}\n\nRecommended next step: focus on overdue, urgent, and blocked work before adding new scope.`
      : `I can help with project planning, task breakdown, prioritization, and summaries. Ask about a project, sprint, task, or today's focus.`;
    return { content, model: "local-deterministic", inputTokens: estimateTokens(promptText), outputTokens: estimateTokens(content), toolCalls };
  }
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function summarizeResult(result: unknown) {
  const text = JSON.stringify(result);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

export function createTaskBreakdown(title: string) {
  const base = title.toLowerCase();
  const prefix = base.includes("auth") ? "authentication" : base.includes("payment") ? "payment" : "feature";
  return [
    `Clarify ${prefix} requirements and acceptance criteria`,
    `Design ${prefix} data model and API contract`,
    `Implement ${prefix} backend validation and permissions`,
    `Build ${prefix} user interface states`,
    `Add unit and integration tests`,
    `Document rollout, monitoring, and support notes`
  ].map((taskTitle, index) => ({ title: taskTitle, priority: index < 2 ? "HIGH" : "MEDIUM", estimatedStoryPoints: index < 2 ? 2 : 3, dependencies: index === 0 ? [] : [0] }));
}

export function createProjectPlan(requirement: string) {
  return {
    project: "AI Generated Project Plan",
    summary: requirement,
    epics: [
      { name: "Foundation", stories: ["Set up architecture", "Define data model", "Create access controls"] },
      { name: "Core Experience", stories: ["Build primary workflows", "Add collaboration states", "Create reporting views"] },
      { name: "Quality and Launch", stories: ["Add tests", "Document release", "Prepare monitoring"] }
    ],
    technicalConsiderations: ["Keep deterministic business logic as source of truth", "Require approval before creating tasks", "Scope all AI tools to current user permissions"]
  };
}

export async function getPermittedWorkspaceContext(prisma: PrismaClient, organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!membership) throw new Error("Organization access denied");
  const [projects, overdueTasks, blockedTasks, members] = await Promise.all([
    prisma.project.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, select: { id: true, key: true, name: true, status: true, targetDate: true, _count: { select: { tasks: true } } }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.task.findMany({ where: { organizationId, dueDate: { lt: new Date() }, status: { not: "Done" } }, select: { id: true, taskKey: true, title: true, priority: true, status: true, dueDate: true }, take: 10 }),
    prisma.task.findMany({ where: { organizationId, blocked: true }, select: { id: true, taskKey: true, title: true, priority: true, status: true }, take: 10 }),
    prisma.organizationMember.findMany({ where: { organizationId }, select: { role: true, user: { select: { id: true, name: true, email: true } } }, take: 20 })
  ]);
  return { projects, overdueTasks, blockedTasks, members };
}

export type PriorityInputTask = {
  taskKey: string;
  title: string;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NO_PRIORITY";
  status: string;
  blocked?: boolean;
  dueDate?: Date | string | null;
  storyPoints?: number | null;
  createdAt?: Date | string | null;
};

export type ProjectHealthTask = PriorityInputTask;

const priorityScore: Record<PriorityInputTask["priority"], number> = {
  URGENT: 40,
  HIGH: 30,
  MEDIUM: 18,
  LOW: 8,
  NO_PRIORITY: 0
};

export function prioritizeTasks(tasks: PriorityInputTask[], now = new Date()) {
  return tasks
    .map((task) => {
      const due = task.dueDate ? new Date(task.dueDate) : null;
      const daysUntilDue = due ? Math.ceil((due.getTime() - now.getTime()) / 86400000) : null;
      const overdueScore = daysUntilDue !== null && daysUntilDue < 0 ? 35 : 0;
      const nearDueScore = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 2 ? 20 : 0;
      const blockedScore = task.blocked ? 25 : 0;
      const effortScore = Math.min(task.storyPoints ?? 0, 13);
      const score = priorityScore[task.priority] + overdueScore + nearDueScore + blockedScore + effortScore;
      const suggestedPriority = score >= 75 ? "URGENT" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
      const reasons = [
        task.blocked ? "blocked" : null,
        overdueScore ? "overdue" : null,
        nearDueScore ? "due soon" : null,
        task.priority !== "NO_PRIORITY" ? `current priority ${task.priority}` : "not prioritized",
        effortScore >= 8 ? "large estimate" : null
      ].filter(Boolean) as string[];
      return { taskKey: task.taskKey, title: task.title, currentPriority: task.priority, suggestedPriority, score, reason: reasons.join(", ") };
    })
    .sort((a, b) => b.score - a.score);
}

export function calculateProjectHealth(tasks: ProjectHealthTask[], now = new Date()) {
  const activeTasks = tasks.filter((task) => task.status !== "Done");
  const overdueTasks = activeTasks.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < now.getTime());
  const blockedTasks = activeTasks.filter((task) => task.blocked);
  const urgentTasks = activeTasks.filter((task) => task.priority === "URGENT");
  const unestimatedTasks = activeTasks.filter((task) => !task.storyPoints);
  const completionPercent = tasks.length === 0 ? 0 : Math.round((tasks.filter((task) => task.status === "Done").length / tasks.length) * 100);
  const overdueRatio = activeTasks.length === 0 ? 0 : overdueTasks.length / activeTasks.length;
  const blockedRatio = activeTasks.length === 0 ? 0 : blockedTasks.length / activeTasks.length;
  const riskScore = Math.round(overdueRatio * 45 + blockedRatio * 35 + urgentTasks.length * 8 + unestimatedTasks.length * 3);
  const health = riskScore >= 50 ? "At Risk" : riskScore >= 20 ? "Attention" : "Healthy";
  const explanation = `${health}: ${overdueTasks.length} overdue, ${blockedTasks.length} blocked, ${urgentTasks.length} urgent, ${completionPercent}% complete.`;
  return { health, riskScore, metrics: { totalTasks: tasks.length, activeTasks: activeTasks.length, overdueTasks: overdueTasks.length, blockedTasks: blockedTasks.length, urgentTasks: urgentTasks.length, unestimatedTasks: unestimatedTasks.length, completionPercent }, explanation };
}

export function createStandup(tasks: PriorityInputTask[], userName = "Team member") {
  const done = tasks.filter((task) => task.status === "Done").slice(0, 5);
  const active = tasks.filter((task) => ["Todo", "In Progress", "In Review", "QA"].includes(task.status)).slice(0, 5);
  const blockers = tasks.filter((task) => task.blocked).slice(0, 5);
  return {
    user: userName,
    yesterday: done.map((task) => `${task.taskKey} ${task.title}`),
    today: active.map((task) => `${task.taskKey} ${task.title}`),
    blockers: blockers.map((task) => `${task.taskKey} ${task.title}`)
  };
}

export function createSprintSummary(tasks: PriorityInputTask[], sprintName = "Sprint") {
  const completed = tasks.filter((task) => task.status === "Done");
  const incomplete = tasks.filter((task) => task.status !== "Done");
  const pointsDone = completed.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
  const pointsTotal = tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
  return {
    sprintName,
    completedWork: completed.map((task) => `${task.taskKey} ${task.title}`),
    incompleteWork: incomplete.map((task) => `${task.taskKey} ${task.title}`),
    velocity: pointsDone,
    remainingStoryPoints: pointsTotal - pointsDone,
    risks: incomplete.filter((task) => task.priority === "URGENT" || task.blocked).map((task) => `${task.taskKey} ${task.title}`),
    suggestedActions: ["Review carry-over work", "Resolve blockers first", "Avoid adding scope until urgent tasks are clear"]
  };
}

export function createRetrospective(tasks: PriorityInputTask[]) {
  const blocked = tasks.filter((task) => task.blocked);
  const completed = tasks.filter((task) => task.status === "Done");
  const carryOver = tasks.filter((task) => task.status !== "Done");
  return {
    wentWell: completed.length ? [`Completed ${completed.length} tasks`] : ["Team maintained sprint visibility"],
    delays: blocked.length ? blocked.map((task) => `${task.taskKey} was blocked`) : ["No repeated blocker pattern detected"],
    carryOver: carryOver.map((task) => `${task.taskKey} ${task.title}`),
    improvements: ["Break down large tasks earlier", "Escalate blocked urgent work within one day", "Keep acceptance criteria attached to each task"]
  };
}
