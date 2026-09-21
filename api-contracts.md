# API Contracts

Base path: `/api`

## Auth

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/verify-email`
- `GET /auth/me`

## Organizations

- `GET /organizations`
- `POST /organizations`
- `GET /organizations/:organizationId/members`

All tenant-scoped endpoints require `Authorization: Bearer <accessToken>` and validate that the authenticated user belongs to the requested organization.

## Future Phase Paths

- `/projects`
- `/projects/:projectId/tasks`
- `/tasks/:taskId/comments`
- `/tasks/:taskId/subtasks`
- `/tasks/:taskId/dependencies`
- `/sprints`
- `/documents`
- `/search`
- `/reports`
- `/notifications`
- `/ai/chat`
- `/ai/plan`
- `/ai/task-breakdown`
- `/ai/prioritize`
- `/ai/project-health`
- `/ai/standup`
- `/ai/sprint-summary`
- `/ai/retrospective`
