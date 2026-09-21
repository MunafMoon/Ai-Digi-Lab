import { describe, expect, it } from "vitest";
import { hasRole } from "./rbac.js";

describe("rbac", () => {
  it("allows higher roles to perform lower-role actions", () => {
    expect(hasRole("OWNER", "VIEWER")).toBe(true);
    expect(hasRole("ADMIN", "PROJECT_MANAGER")).toBe(true);
  });

  it("does not allow lower roles to perform higher-role actions", () => {
    expect(hasRole("VIEWER", "ADMIN")).toBe(false);
    expect(hasRole("QA", "PROJECT_MANAGER")).toBe(false);
  });
});
