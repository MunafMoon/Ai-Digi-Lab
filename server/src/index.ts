import cors from "cors";
import express, { ErrorRequestHandler } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { config } from "./config.js";
import { router } from "./routes.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
app.use("/api", router);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) return res.status(400).json({ error: "Validation failed", issues: error.flatten() });
  if (error?.code === "P2002") return res.status(409).json({ error: "A unique record already exists" });
  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

app.listen(config.PORT, () => console.log(`TaskPilot API listening on http://localhost:${config.PORT}`));
