import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { createHash } from "node:crypto";
import { User } from "@prisma/client";
import { config } from "./config.js";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user: Pick<User, "id" | "email">) {
  const options: SignOptions = { expiresIn: config.JWT_ACCESS_TTL as SignOptions["expiresIn"] };
  return jwt.sign({ sub: user.id, email: user.email }, config.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(user: Pick<User, "id" | "email">) {
  const options: SignOptions = { expiresIn: `${config.JWT_REFRESH_TTL_DAYS}d` as SignOptions["expiresIn"] };
  return jwt.sign({ sub: user.id, email: user.email }, config.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as { sub: string; email: string };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}


