import { NextFunction, Request, Response } from "express";
import { OrganizationRole } from "@prisma/client";
import { prisma } from "./db.js";
import { hasRole } from "./rbac.js";
import { verifyAccessToken } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      membership?: { organizationId: string; role: OrganizationRole };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireOrganization(minimumRole: OrganizationRole = "VIEWER") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const organizationId = req.params.organizationId ?? req.header("x-organization-id");
    if (!req.user || !organizationId) return res.status(400).json({ error: "Organization context is required" });
    const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: req.user.id } } });
    if (!membership || !hasRole(membership.role, minimumRole)) return res.status(403).json({ error: "Insufficient organization permissions" });
    req.membership = { organizationId, role: membership.role };
    return next();
  };
}
