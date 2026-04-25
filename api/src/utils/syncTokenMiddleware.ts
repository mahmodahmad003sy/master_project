import { NextFunction, Request, Response } from "express";
import config from "../../config/default.json";

export const requireSyncToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const provided = req.header("x-sync-token");
  const expected = config.COLAB_SYNC_TOKEN;

  if (!expected || expected === "change-me-to-a-long-random-string") {
    res.status(500).json({ error: "COLAB_SYNC_TOKEN is not configured" });
    return;
  }

  if (!provided || provided !== expected) {
    res.status(401).json({ error: "invalid or missing X-Sync-Token" });
    return;
  }

  next();
};
