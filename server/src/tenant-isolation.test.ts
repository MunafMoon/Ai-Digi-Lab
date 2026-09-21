import { describe, expect, it } from "vitest";

function projectAccessWhere(projectId: string, userId: string) {
  return { id: projectId, organization: { members: { some: { userId } } } };
}

function taskAccessWhere(taskId: string, userId: string) {
  return { id: taskId, project: { organization: { members: { some: { userId } } } } };
}

describe("tenant isolation query guards", () => {
  it("scopes project access through organization membership", () => {
    expect(projectAccessWhere("project-a", "user-a")).toEqual({
      id: "project-a",
      organization: { members: { some: { userId: "user-a" } } }
    });
  });

  it("scopes task access through project organization membership", () => {
    expect(taskAccessWhere("task-a", "user-a")).toEqual({
      id: "task-a",
      project: { organization: { members: { some: { userId: "user-a" } } } }
    });
  });
});
