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
