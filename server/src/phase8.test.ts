import { describe, expect, it } from "vitest";
import { getRuntimeChecks, onboardingSteps, performanceBudget } from "./phase8.js";

describe("phase 8 production readiness", () => {
  it("requires production secrets for ready status", () => {
    const result = getRuntimeChecks({ DATABASE_URL: "postgres://db", JWT_ACCESS_SECRET: "access-secret", JWT_REFRESH_SECRET: "refresh-secret", CORS_ORIGIN: "https://app.example.com" });

    expect(result.status).toBe("ready");
    expect(result.checks.filter((check) => check.required).every((check) => check.ok)).toBe(true);
  });

  it("flags default secrets as not production ready", () => {
    const result = getRuntimeChecks({ DATABASE_URL: "postgres://db", JWT_ACCESS_SECRET: "change-me-access", JWT_REFRESH_SECRET: "change-me-refresh", CORS_ORIGIN: "http://localhost:5173" });

    expect(result.status).toBe("needs_configuration");
  });

  it("reports onboarding completion steps", () => {
    const steps = onboardingSteps({ workspaceCreated: true, teamInvited: false, projectCreated: true, methodologySelected: true });

    expect(steps).toHaveLength(4);
    expect(steps.find((step) => step.key === "invite")?.complete).toBe(false);
  });

  it("checks performance budgets", () => {
    expect(performanceBudget({ jsKb: 500, cssKb: 20, apiP95Ms: 300 }).passed).toBe(true);
    expect(performanceBudget({ jsKb: 900, cssKb: 20, apiP95Ms: 300 }).passed).toBe(false);
  });
});
