export type RuntimeCheck = {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
};

export function getRuntimeChecks(env: NodeJS.ProcessEnv) {
  const checks: RuntimeCheck[] = [
    { key: "database", label: "DATABASE_URL configured", ok: Boolean(env.DATABASE_URL), required: true },
    { key: "jwt_access", label: "JWT_ACCESS_SECRET configured", ok: Boolean(env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET !== "change-me-access"), required: true },
    { key: "jwt_refresh", label: "JWT_REFRESH_SECRET configured", ok: Boolean(env.JWT_REFRESH_SECRET && env.JWT_REFRESH_SECRET !== "change-me-refresh"), required: true },
    { key: "cors", label: "CORS_ORIGIN configured", ok: Boolean(env.CORS_ORIGIN), required: true },
    { key: "ai_model", label: "AI model configured", ok: Boolean(env.AI_MODEL), required: false },
    { key: "object_storage", label: "S3 bucket configured", ok: Boolean(env.S3_BUCKET), required: false },
    { key: "billing", label: "Stripe secret configured", ok: Boolean(env.STRIPE_SECRET_KEY), required: false }
  ];

  return {
    status: checks.filter((check) => check.required).every((check) => check.ok) ? "ready" : "needs_configuration",
    checks
  };
}

export function onboardingSteps(input: { workspaceCreated: boolean; teamInvited: boolean; projectCreated: boolean; methodologySelected: boolean }) {
  return [
    { key: "workspace", title: "Create workspace", complete: input.workspaceCreated },
    { key: "invite", title: "Invite team", complete: input.teamInvited },
    { key: "project", title: "Create first project", complete: input.projectCreated },
    { key: "methodology", title: "Choose methodology", complete: input.methodologySelected }
  ];
}

export function performanceBudget(input: { jsKb: number; cssKb: number; apiP95Ms: number }) {
  const limits = { jsKb: 650, cssKb: 80, apiP95Ms: 500 };
  const results = [
    { key: "js", label: "Client JavaScript", value: input.jsKb, limit: limits.jsKb, ok: input.jsKb <= limits.jsKb },
    { key: "css", label: "Client CSS", value: input.cssKb, limit: limits.cssKb, ok: input.cssKb <= limits.cssKb },
    { key: "api", label: "API p95 latency", value: input.apiP95Ms, limit: limits.apiP95Ms, ok: input.apiP95Ms <= limits.apiP95Ms }
  ];

  return { passed: results.every((result) => result.ok), results };
}
