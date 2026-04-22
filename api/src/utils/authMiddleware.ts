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
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice(7);
  try {
    const payload: any = jwt.verify(token, JWT_SECRET);
    if (!payload.userId) return res.status(401).json({ error: "Unauthorized" });
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};
