# TaskPilot AI

TaskPilot AI is an AI-powered, multi-tenant project and task management SaaS scaffold. This repository currently implements Phase 1 foundations: architecture docs, database model, authentication primitives, organization membership/RBAC, seed data, and a React application shell.

## Stack

- React, TypeScript, Vite, Tailwind CSS, TanStack Query, Recharts
- Node.js, Express, TypeScript
- PostgreSQL, Prisma ORM
- Redis and MinIO via Docker Compose
- JWT access and refresh token architecture

## Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Start infrastructure:

```bash
docker compose up postgres redis minio
```

3. Install dependencies:

```bash
npm install
```

4. Generate Prisma client and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Seed demo data:

```bash
npm run seed
```

6. Run development servers:

```bash
npm run dev --workspace server
npm run dev --workspace client
```

The API runs on `http://localhost:4000` and the client runs on `http://localhost:5173`.

## Demo Login

Seed creates `alex@acme.test` with password `TaskPilot123!`.

## Architecture Notes

Every tenant-scoped API must resolve the authenticated user and organization membership before reading or mutating business data. AI tools will use the same tenant-aware service layer so AI cannot access projects, tasks, documents, or comments outside the current user's permissions.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

## Next Phase

Phase 2 now includes project CRUD, task CRUD, comments, activity logs, tenant-scoped API guards, and a local-state Kanban board. Phase 3 adds sprints, backlog, epics, roadmap, and calendar APIs plus matching local-state UI tabs. Next, wire these screens to the API with TanStack Query and add integration tests against PostgreSQL.

## Phase 2 API Highlights

- GET /api/organizations/:organizationId/projects`n- POST /api/organizations/:organizationId/projects`n- GET /api/projects/:projectId`n- PATCH /api/projects/:projectId`n- DELETE /api/projects/:projectId`n- GET /api/projects/:projectId/tasks`n- POST /api/projects/:projectId/tasks`n- GET /api/tasks/:taskId`n- PATCH /api/tasks/:taskId`n- DELETE /api/tasks/:taskId`n- POST /api/tasks/:taskId/comments`n- GET /api/organizations/:organizationId/activity`n

## Phase 3 API Highlights

- GET /api/projects/:projectId/epics`n- POST /api/projects/:projectId/epics`n- PATCH /api/epics/:epicId`n- GET /api/projects/:projectId/sprints`n- POST /api/projects/:projectId/sprints`n- PATCH /api/sprints/:sprintId`n- POST /api/sprints/:sprintId/complete`n- GET /api/projects/:projectId/backlog`n- POST /api/tasks/:taskId/move-to-sprint`n- GET /api/projects/:projectId/roadmap`n- GET /api/projects/:projectId/calendar`n

## Phase 4 API Highlights

- POST /api/ai/chat`n- POST /api/ai/plan`n- POST /api/ai/task-breakdown`n- POST /api/projects/:projectId/ai/task-draft`n
AI provider settings use OPENAI_API_KEY, AI_BASE_URL, and AI_MODEL. Without an API key, the server uses a deterministic local fallback so development remains usable offline.


## Phase 5 API Highlights

- POST /api/ai/prioritize`n- POST /api/ai/project-health`n- POST /api/ai/standup`n- POST /api/ai/sprint-summary`n- POST /api/ai/retrospective`n
Project health and prioritization use deterministic metrics first, then present AI-style explanations and editable recommendations. No important project data is silently changed.


## Phase 6 API Highlights

- GET /api/organizations/:organizationId/documents`n- POST /api/organizations/:organizationId/documents`n- GET /api/documents/:documentId`n- GET /api/organizations/:organizationId/search?q=...`n- GET /api/projects/:projectId/reports/summary`n- GET /api/organizations/:organizationId/notifications`n- PATCH /api/notifications/:notificationId/read`n
Search currently combines deterministic keyword scoring with a semantic-ready response shape. Production RAG still needs embeddings and document chunk storage.


## Phase 7 API Highlights

- GET /api/organizations/:organizationId/billing/plans
- GET /api/organizations/:organizationId/ai/usage
- PATCH /api/organizations/:organizationId/ai/settings
- GET /api/organizations/:organizationId/security/checklist
- GET /api/organizations/:organizationId/audit-logs
- POST /api/organizations/:organizationId/uploads/validate

Billing is Stripe-ready through STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, and STRIPE_WEBHOOK_SECRET. Phase 7 adds AI budget controls and admin security visibility; live checkout and webhook persistence are the next backend step.
