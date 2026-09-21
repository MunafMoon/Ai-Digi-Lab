import { describe, expect, it } from "vitest";
import { createProjectPlan, createTaskBreakdown, estimateTokens } from "./ai.js";

describe("ai deterministic helpers", () => {
  it("estimates tokens conservatively", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("")).toBe(1);
  });

  it("creates a structured task breakdown proposal without mutating data", () => {
    const tasks = createTaskBreakdown("Implement payment system");
    expect(tasks).toHaveLength(6);
    expect(tasks[0].title).toContain("payment");
    expect(tasks[0].priority).toBe("HIGH");
  });

  it("creates an editable project plan proposal", () => {
    const plan = createProjectPlan("Build ecommerce checkout");
    expect(plan.epics.map((epic) => epic.name)).toEqual(["Foundation", "Core Experience", "Quality and Launch"]);
    expect(plan.technicalConsiderations).toContain("Require approval before creating tasks");
  });
});
