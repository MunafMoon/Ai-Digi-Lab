# Database Schema

The Prisma schema in `server/prisma/schema.prisma` defines the commercial SaaS data model requested for TaskPilot AI.

Important choices:

- UUID primary keys for internal identifiers.
- Human-readable task keys generated from project key plus `taskSequence`.
- Organization isolation via required `organizationId` on tenant-scoped models.
- Join tables for organization, team, and project memberships.
- Audit and AI activity tables for administrative transparency.
- Refresh tokens are hashed and revocable.

Critical models included: `User`, `Organization`, `OrganizationMember`, `Team`, `TeamMember`, `Project`, `ProjectMember`, `Epic`, `Sprint`, `Task`, `TaskDependency`, `TaskLabel`, `Label`, `Comment`, `Attachment`, `Document`, `Notification`, `ActivityLog`, `AIConversation`, `AIMessage`, `AIUsage`, `AIAction`, `Invitation`, and `RefreshToken`.
