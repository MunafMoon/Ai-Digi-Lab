import { describe, expect, it } from "vitest";
import { billingPlans, canUseAi, redactSecret, summarizeAiUsage, validateUpload } from "./phase7.js";

describe("phase 7 admin and billing helpers", () => {
  it("allows AI usage when budget is uncapped and daily requests remain", () => {
    const result = canUseAi({ monthlyBudgetCents: 0, dailyRequestLimit: 10, monthlySpendCents: 500, dailyRequests: 3 });

    expect(result.allowed).toBe(true);
    expect(result.remainingDailyRequests).toBe(7);
    expect(result.remainingBudgetCents).toBe(Number.POSITIVE_INFINITY);
  });

  it("blocks AI usage when budget or daily limit is exhausted", () => {
    const result = canUseAi({ monthlyBudgetCents: 100, dailyRequestLimit: 5, monthlySpendCents: 100, dailyRequests: 5 });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["monthly_ai_budget_exceeded", "daily_ai_request_limit_exceeded"]);
  });

  it("summarizes usage by feature and model", () => {
    const summary = summarizeAiUsage([
      { feature: "ai_chat", model: "gpt", inputTokens: 100, outputTokens: 50, estimatedCostCents: 1 },
      { feature: "ai_chat", model: "gpt", inputTokens: 40, outputTokens: 20, estimatedCostCents: 1 },
      { feature: "project_health", model: "deterministic", inputTokens: 10, outputTokens: 5, estimatedCostCents: 0 }
    ]);

    expect(summary.totalRequests).toBe(3);
    expect(summary.totalInputTokens).toBe(150);
    expect(summary.requestsByFeature.ai_chat).toBe(2);
    expect(summary.requestsByModel.gpt).toBe(2);
  });

  it("validates document upload metadata", () => {
    expect(validateUpload({ fileName: "requirements.pdf", mimeType: "application/pdf", sizeBytes: 1024 }).valid).toBe(true);
    expect(validateUpload({ fileName: "", mimeType: "application/x-msdownload", sizeBytes: 20 * 1024 * 1024 }).errors).toEqual(["file_name_required", "unsupported_file_type", "file_too_large"]);
  });

  it("keeps billing prices external to provider configuration", () => {
    expect(billingPlans.map((plan) => plan.priceKey)).toContain("price_business_monthly");
    expect(billingPlans.every((plan) => plan.features.length > 0)).toBe(true);
  });

  it("redacts configured secrets", () => {
    expect(redactSecret(undefined)).toBe("not_configured");
    expect(redactSecret("sk_test_1234567890")).toBe("sk_t...7890");
  });
});
