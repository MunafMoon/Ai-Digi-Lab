# Production Deployment

TaskPilot AI can be deployed as two services plus managed infrastructure:

- Client: static Vite build from `client/dist`.
- API: Node.js service from `server/dist`.
- Data services: PostgreSQL, Redis, and S3-compatible object storage.

Required deploy gates:

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `GET /api/ready` returns `status: ready` after secrets and database are configured.

Local Docker smoke test:

```bash
docker compose up --build
```

Production notes:

- Never use `change-me-access` or `change-me-refresh` in production.
- Keep AI and Stripe keys server-side only.
- Set `CORS_ORIGIN` to the deployed frontend origin.
- Run database migrations before routing traffic to a new API version.
