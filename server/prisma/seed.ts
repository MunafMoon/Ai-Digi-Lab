import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth.js";

const prisma = new PrismaClient();
const day = 24 * 60 * 60 * 1000;

async function main() {
  const owner = await prisma.user.upsert({ where: { email: "alex@acme.test" }, update: {}, create: { name: "Alex Morgan", email: "alex@acme.test", passwordHash: await hashPassword("TaskPilot123!"), emailVerifiedAt: new Date() } });
  const maya = await prisma.user.upsert({ where: { email: "maya@acme.test" }, update: {}, create: { name: "Maya Chen", email: "maya@acme.test", passwordHash: await hashPassword("TaskPilot123!"), emailVerifiedAt: new Date() } });
  const org = await prisma.organization.upsert({ where: { slug: "acme-technologies" }, update: {}, create: { name: "Acme Technologies", slug: "acme-technologies", members: { create: { userId: owner.id, role: "OWNER" } } } });
  await prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId: org.id, userId: maya.id } }, update: {}, create: { organizationId: org.id, userId: maya.id, role: "DEVELOPER" } });

  const projects = [["E-Commerce Platform", "ECOM"], ["Mobile Banking App", "BANK"], ["CRM Platform", "CRM"]] as const;
  for (const [name, key] of projects) {
    const project = await prisma.project.upsert({ where: { organizationId_key: { organizationId: org.id, key } }, update: { taskSequence: 6, targetDate: new Date(Date.now() + 45 * day) }, create: { organizationId: org.id, name, key, status: "ACTIVE", methodology: "SCRUM", managerId: owner.id, taskSequence: 6, targetDate: new Date(Date.now() + 45 * day) } });
    await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: owner.id } }, update: {}, create: { projectId: project.id, userId: owner.id, role: "OWNER" } });

    const authEpic = await prisma.epic.upsert({ where: { id: `${project.id.slice(0, 24)}epic01` }, update: {}, create: { id: `${project.id.slice(0, 24)}epic01`, organizationId: org.id, projectId: project.id, name: "Authentication", description: "Login, OAuth, sessions, and authorization hardening." } });
    const checkoutEpic = await prisma.epic.upsert({ where: { id: `${project.id.slice(0, 24)}epic02` }, update: {}, create: { id: `${project.id.slice(0, 24)}epic02`, organizationId: org.id, projectId: project.id, name: "Checkout Reliability", description: "Reduce checkout failures and improve payment visibility." } });
    const activeSprint = await prisma.sprint.upsert({ where: { id: `${project.id.slice(0, 24)}sprint1` }, update: { status: "ACTIVE" }, create: { id: `${project.id.slice(0, 24)}sprint1`, organizationId: org.id, projectId: project.id, name: "Sprint Alpha", goal: "Ship secure authentication and stabilize checkout.", status: "ACTIVE", startDate: new Date(Date.now() - 3 * day), endDate: new Date(Date.now() + 11 * day) } });
    const nextSprint = await prisma.sprint.upsert({ where: { id: `${project.id.slice(0, 24)}sprint2` }, update: {}, create: { id: `${project.id.slice(0, 24)}sprint2`, organizationId: org.id, projectId: project.id, name: "Sprint Beta", goal: "Complete integration tests and polish handoff workflows.", status: "PLANNED", startDate: new Date(Date.now() + 12 * day), endDate: new Date(Date.now() + 26 * day) } });

    const taskInputs = [
      [`${key}-1`, "Design authentication flow", "In Progress", "HIGH", owner.id, 5, authEpic.id, activeSprint.id, 4],
      [`${key}-2`, "Configure Google OAuth", "Todo", "URGENT", maya.id, 3, authEpic.id, activeSprint.id, 2],
      [`${key}-3`, "Build checkout timeout alert", "QA", "MEDIUM", owner.id, 2, checkoutEpic.id, activeSprint.id, 6],
      [`${key}-4`, "Write auth integration tests", "Backlog", "HIGH", maya.id, 5, authEpic.id, nextSprint.id, 14],
      [`${key}-5`, "Review payment webhook logging", "Done", "LOW", owner.id, 2, checkoutEpic.id, activeSprint.id, -1],
      [`${key}-6`, "Document sprint release notes", "Backlog", "NO_PRIORITY", owner.id, 1, null, null, 21]
    ] as const;

    for (const [taskKey, title, status, priority, assigneeId, storyPoints, epicId, sprintId, dueOffset] of taskInputs) {
      const task = await prisma.task.upsert({ where: { projectId_taskKey: { projectId: project.id, taskKey } }, update: { status, priority, assigneeId, storyPoints, epicId, sprintId, dueDate: new Date(Date.now() + dueOffset * day), startDate: new Date(Date.now() - 2 * day) }, create: { organizationId: org.id, projectId: project.id, taskKey, title, description: `Demo task for ${name}.`, priority, reporterId: owner.id, assigneeId, storyPoints, status, epicId, sprintId, dueDate: new Date(Date.now() + dueOffset * day), startDate: new Date(Date.now() - 2 * day) } });
      await prisma.comment.upsert({ where: { id: `${task.id.slice(0, 24)}comment1` }, update: {}, create: { id: `${task.id.slice(0, 24)}comment1`, taskId: task.id, authorId: owner.id, body: "Seeded discussion note for the project board." } });
    }

    await prisma.activityLog.create({ data: { organizationId: org.id, userId: owner.id, action: "SEED_PHASE3_READY", entityType: "Project", entityId: project.id, newValue: { key, name, activeSprint: activeSprint.name, nextSprint: nextSprint.name } } });
  }
}

main().finally(async () => prisma.$disconnect());
