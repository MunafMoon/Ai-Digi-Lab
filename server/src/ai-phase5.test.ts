import { describe, expect, it } from "vitest";
import { calculateProjectHealth, createRetrospective, createSprintSummary, createStandup, prioritizeTasks } from "./ai.js";

const now = new Date("2026-09-22T00:00:00.000Z");
const tasks = [
  { taskKey: "ECOM-1", title: "Blocked login", priority: "URGENT" as const, status: "In Progress", blocked: true, dueDate: "2026-09-20T00:00:00.000Z", storyPoints: 5 },
  { taskKey: "ECOM-2", title: "Checkout copy", priority: "LOW" as const, status: "Todo", blocked: false, dueDate: "2026-09-25T00:00:00.000Z", storyPoints: 2 },
  { taskKey: "ECOM-3", title: "Webhook logs", priority: "MEDIUM" as const, status: "Done", blocked: false, dueDate: "2026-09-21T00:00:00.000Z", storyPoints: 3 }
];

describe("phase 5 ai workflows", () => {
  it("prioritizes overdue blocked urgent tasks first", () => {
    const result = prioritizeTasks(tasks, now);
    expect(result[0]).toMatchObject({ taskKey: "ECOM-1", suggestedPriority: "URGENT" });
  });

  it("calculates project health deterministically", () => {
    const health = calculateProjectHealth(tasks, now);
    expect(health.health).toBe("Attention");
    expect(health.metrics.overdueTasks).toBe(1);
    expect(health.explanation).toContain("blocked");
  });

  it("creates editable standup content", () => {
    const standup = createStandup(tasks, "Alex");
    expect(standup.user).toBe("Alex");
    expect(standup.blockers[0]).toContain("ECOM-1");
  });

  it("summarizes sprint completion and carry-over", () => {
    const summary = createSprintSummary(tasks, "Sprint Alpha");
    expect(summary.velocity).toBe(3);
    expect(summary.remainingStoryPoints).toBe(7);
    expect(summary.risks[0]).toContain("ECOM-1");
  });

  it("creates retrospective themes from task history", () => {
    const retro = createRetrospective(tasks);
    expect(retro.wentWell[0]).toContain("Completed");
    expect(retro.improvements).toContain("Escalate blocked urgent work within one day");
  });
});

