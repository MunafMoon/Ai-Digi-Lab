import { describe, expect, it } from "vitest";
import { buildProjectReport, searchItems } from "./phase6.js";

describe("phase 6 search and reporting", () => {
  it("ranks title matches above body matches", () => {
    const results = searchItems("checkout", [
      { type: "document", id: "1", title: "Payment notes", body: "checkout timeout" },
      { type: "task", id: "2", title: "Checkout bug", body: "payment" }
    ]);
    expect(results[0].id).toBe("2");
  });

  it("builds project report metrics", () => {
    const report = buildProjectReport([
      { status: "Done", storyPoints: 3, type: "TASK", assigneeId: "a" },
      { status: "Todo", storyPoints: 5, type: "BUG", assigneeId: null }
    ]);
    expect(report.completionRate).toBe(50);
    expect(report.remainingStoryPoints).toBe(5);
    expect(report.bugCount).toBe(1);
    expect(report.byStatus.Done).toBe(1);
  });
});
