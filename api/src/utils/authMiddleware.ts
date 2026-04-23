// src/utils/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../../config/default.json";

const JWT_SECRET = config.auth.jwtSecret;

export interface AuthRequest extends Request {
  userId?: number;
}

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : "";
  const queryToken =
    req.method === "GET" &&
    /^\/api\/runs\/\d+\/image$/.test(req.originalUrl.split("?")[0]) &&
    typeof req.query.token === "string"
      ? req.query.token
      : "";
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    if (!payload.userId) return res.status(401).json({ error: "Unauthorized" });
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};
