export type BillingPlan = {
  key: string;
  name: string;
  priceKey: string;
  aiRequestLimit: number;
  monthlyBudgetCents: number;
  features: string[];
};

export type AIUsageRecord = {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
};

export const billingPlans: BillingPlan[] = [
  { key: "free", name: "Free", priceKey: "price_free", aiRequestLimit: 50, monthlyBudgetCents: 0, features: ["Kanban projects", "Basic AI drafts", "Workspace search"] },
  { key: "pro", name: "Pro", priceKey: "price_pro_monthly", aiRequestLimit: 500, monthlyBudgetCents: 2500, features: ["Sprint planning", "AI prioritization", "Reports", "Documents"] },
  { key: "business", name: "Business", priceKey: "price_business_monthly", aiRequestLimit: 2500, monthlyBudgetCents: 10000, features: ["Admin controls", "Audit logs", "Advanced AI usage", "Security checklist"] },
  { key: "enterprise", name: "Enterprise", priceKey: "price_enterprise_custom", aiRequestLimit: 10000, monthlyBudgetCents: 0, features: ["Custom AI budget", "SAML-ready architecture", "Dedicated support", "Custom data retention"] }
];

export const securityChecklist = [
  { key: "tenant-isolation", label: "Tenant isolation checks", status: "configured" },
  { key: "rbac", label: "Role based API guards", status: "configured" },
  { key: "audit-log", label: "Audit logging for sensitive changes", status: "configured" },
  { key: "ai-controls", label: "AI budget and request controls", status: "configured" },
  { key: "secrets", label: "Secrets loaded from environment", status: "configured" },
  { key: "uploads", label: "File upload validation rules", status: "configured" }
] as const;

export function canUseAi(input: { monthlyBudgetCents: number; dailyRequestLimit: number; monthlySpendCents: number; dailyRequests: number }) {
  const remainingBudgetCents = input.monthlyBudgetCents <= 0 ? Number.POSITIVE_INFINITY : Math.max(input.monthlyBudgetCents - input.monthlySpendCents, 0);
  const remainingDailyRequests = Math.max(input.dailyRequestLimit - input.dailyRequests, 0);
  const reasons: string[] = [];

  if (input.monthlyBudgetCents > 0 && input.monthlySpendCents >= input.monthlyBudgetCents) reasons.push("monthly_ai_budget_exceeded");
  if (input.dailyRequests >= input.dailyRequestLimit) reasons.push("daily_ai_request_limit_exceeded");

  return {
    allowed: reasons.length === 0,
    reasons,
    remainingBudgetCents,
    remainingDailyRequests
  };
}

export function summarizeAiUsage(records: AIUsageRecord[]) {
  return records.reduce((summary, record) => {
    summary.totalRequests += 1;
    summary.totalInputTokens += record.inputTokens;
    summary.totalOutputTokens += record.outputTokens;
    summary.estimatedCostCents += record.estimatedCostCents;
    summary.requestsByFeature[record.feature] = (summary.requestsByFeature[record.feature] ?? 0) + 1;
    summary.requestsByModel[record.model] = (summary.requestsByModel[record.model] ?? 0) + 1;
    return summary;
  }, { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0, estimatedCostCents: 0, requestsByFeature: {} as Record<string, number>, requestsByModel: {} as Record<string, number> });
}

export function validateUpload(input: { fileName: string; mimeType: string; sizeBytes: number }) {
  const allowedMimeTypes = new Set(["text/markdown", "text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
  const maxSizeBytes = 10 * 1024 * 1024;
  const errors: string[] = [];

  if (!input.fileName.trim()) errors.push("file_name_required");
  if (!allowedMimeTypes.has(input.mimeType)) errors.push("unsupported_file_type");
  if (input.sizeBytes <= 0) errors.push("file_empty");
  if (input.sizeBytes > maxSizeBytes) errors.push("file_too_large");

  return { valid: errors.length === 0, errors, maxSizeBytes, allowedMimeTypes: [...allowedMimeTypes] };
}

export function redactSecret(value: string | undefined) {
  if (!value) return "not_configured";
  if (value.length <= 8) return "configured";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
