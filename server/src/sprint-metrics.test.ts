import { describe, expect, it } from "vitest";
import { calculateSprintMetrics } from "./sprint-metrics.js";

describe("calculateSprintMetrics", () => {
  it("calculates completion using story points", () => {
    expect(calculateSprintMetrics([{ status: "Done", storyPoints: 5 }, { status: "In Progress", storyPoints: 3 }, { status: "Todo", storyPoints: 2 }])).toEqual({
      totalTasks: 3,
      completedTasks: 1,
      totalStoryPoints: 10,
      completedStoryPoints: 5,
      remainingStoryPoints: 5,
      completionPercent: 50
    });
  });

  it("handles unestimated sprints", () => {
    expect(calculateSprintMetrics([{ status: "Todo", storyPoints: null }]).completionPercent).toBe(0);
  });
});
