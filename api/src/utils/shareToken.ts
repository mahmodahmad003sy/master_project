import jwt from "jsonwebtoken";
import config from "../config";

const SECRET = config.auth.jwtSecret;

export function signShareToken(runId: number, ttlHours = 24): string {
  return jwt.sign({ runId, scope: "read" }, SECRET, {
    expiresIn: `${ttlHours}h`,
  });
}

export function verifyShareToken(token: string, runId: number): boolean {
  try {
    const payload = jwt.verify(token, SECRET) as {
      runId?: number;
      scope?: string;
    };
    return payload?.scope === "read" && Number(payload.runId) === runId;
  } catch {
    return false;
  }
}
