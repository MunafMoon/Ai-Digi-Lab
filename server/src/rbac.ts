import { OrganizationRole } from "@prisma/client";

const roleRank: Record<OrganizationRole, number> = {
  OWNER: 6,
  ADMIN: 5,
  PROJECT_MANAGER: 4,
  DEVELOPER: 3,
  QA: 2,
  VIEWER: 1
};

export function hasRole(role: OrganizationRole, minimum: OrganizationRole) {
  return roleRank[role] >= roleRank[minimum];
}
