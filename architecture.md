# TaskPilot AI Architecture

TaskPilot AI is a multi-tenant project and task management SaaS with a deterministic project-management core and an AI assistant layered on top. The source of truth is PostgreSQL through Prisma. AI features may summarize, propose, search, and explain, but they do not directly mutate business data without an explicit approved action.

## Runtime Shape

- `client`: React, TypeScript, Vite, Tailwind, TanStack Query, React Hook Form, Zod.
- `server`: Node.js, TypeScript, Express, Prisma, JWT auth, RBAC middleware.
- `postgres`: transactional source of truth.
- `redis`: BullMQ queues, rate limits, notification fanout.
- `minio`: local S3-compatible attachment storage.

## Tenancy Model

All business entities belong to an `organizationId` either directly or through a parent project/team. API handlers resolve the authenticated user, current organization, and membership role before querying tenant data. Queries always include the organization boundary and permission checks.

## Phase 1 Scope

Phase 1 establishes the repository, Docker services, Prisma schema, authentication primitives, organizations, membership roles, RBAC middleware, seed data, and API contracts. Later phases add full project/task workflows, realtime updates, AI tools, documents/RAG, billing, and production hardening.

## Security Principles

- Passwords are hashed with bcrypt.
- Access tokens are short lived; refresh tokens are persisted as revocable hashed tokens.
- Organization isolation is enforced in middleware and repositories.
- AI tool execution inherits the user's permissions.
- Provider API keys remain server-side only.
