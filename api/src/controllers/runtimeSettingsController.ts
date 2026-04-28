import { Request, Response } from "express";
import {
  isRuntimeSettingKey,
  listRuntimeSettings,
  RuntimeSettingKey,
  updateRuntimeSettings,
} from "../services/runtimeSettings";

export const getRuntimeSettings = async (_req: Request, res: Response) => {
  const items = await listRuntimeSettings();
  res.json({ items });
};

export const putRuntimeSettings = async (req: Request, res: Response) => {
  const payload =
    req.body && typeof req.body.settings === "object" && req.body.settings
      ? req.body.settings
      : req.body;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return res.status(400).json({ error: "Body must be a JSON object" });
  }

  const updates: Partial<Record<RuntimeSettingKey, string | null>> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (!isRuntimeSettingKey(key)) {
      return res.status(400).json({ error: `Unknown runtime setting "${key}"` });
    }

    if (value !== null && typeof value !== "string") {
      return res.status(400).json({
        error: `Runtime setting "${key}" must be a string or null`,
      });
    }

    updates[key] = value as string | null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "At least one runtime setting is required" });
  }

  const items = await updateRuntimeSettings(updates);
  res.json({ items });
};
