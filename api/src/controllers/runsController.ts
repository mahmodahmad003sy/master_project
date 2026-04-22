import fs from "fs";
import { Response } from "express";
import { SelectQueryBuilder } from "typeorm";
import { ComparisonRun } from "../entities/ComparisonRun";
import {
  ArtifactName,
  artifactPath,
  imagePath,
  removeRunDir,
} from "../services/runStorage";
import { AuthRequest } from "../utils/authMiddleware";
import { loadRunArtifacts, runCompare } from "./compareController";

const artifactMap: Record<string, ArtifactName> = {
  raw: "raw_response",
  classical: "classical",
  vlm: "vlm",
  hybrid: "hybrid",
  "ground-truth": "ground_truth",
  metrics: "metrics",
};

function parseIntegerParam(value: string | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw { statusCode: 400, message: `Invalid integer value "${value}"` };
  }

  return parsed;
}

function parseDateParam(label: string, value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw { statusCode: 400, message: `Invalid ${label} "${value}"` };
  }

  return parsed;
}

function applyDateFilters(
  qb: SelectQueryBuilder<ComparisonRun>,
  dateFrom: Date | null,
  dateTo: Date | null
) {
  if (dateFrom) {
    qb.andWhere("run.createdAt >= :dateFrom", {
      dateFrom: dateFrom.toISOString(),
    });
  }

  if (dateTo) {
    qb.andWhere("run.createdAt <= :dateTo", { dateTo: dateTo.toISOString() });
  }
}

async function findRunForUser(id: number, userId?: number) {
  const run = await ComparisonRun.findOne({
    where: { id },
    relations: { user: true },
  });

  if (!run) {
    return null;
  }

  if (userId && run.user && run.user.id !== userId) {
    return null;
  }

  return run;
}

export const postCompare = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw { statusCode: 400, message: "No file uploaded" };
  }

  const documentType = String(req.body.documentType ?? req.query.documentType ?? "");
  if (!documentType) {
    throw { statusCode: 400, message: "documentType is required" };
  }

  const { run, response } = await runCompare({
    file: req.file,
    documentTypeKey: documentType,
    userId: req.userId ?? null,
  });

  res.status(201).json({ runId: run.id, run, response });
};

export const listRuns = async (req: AuthRequest, res: Response) => {
  const query = req.query as Record<string, string | undefined>;
  const limit = Math.min(parseIntegerParam(query.limit, 20), 200);
  const offset = parseIntegerParam(query.offset, 0);
  const dateFrom = parseDateParam("dateFrom", query.dateFrom);
  const dateTo = parseDateParam("dateTo", query.dateTo);

  const qb = ComparisonRun.createQueryBuilder("run")
    .leftJoin("run.user", "user")
    .orderBy("run.createdAt", "DESC")
    .take(limit)
    .skip(offset);

  if (req.userId) {
    qb.andWhere("user.id = :userId", { userId: req.userId });
  }

  if (query.search) {
    qb.andWhere("LOWER(run.filename) LIKE LOWER(:search)", {
      search: `%${query.search}%`,
    });
  }

  if (query.documentType) {
    qb.andWhere("run.documentType = :documentType", {
      documentType: query.documentType,
    });
  }

  if (query.hasGroundTruth === "true") {
    qb.andWhere("run.hasGroundTruth = true");
  }

  if (query.hasGroundTruth === "false") {
    qb.andWhere("run.hasGroundTruth = false");
  }

  applyDateFilters(qb, dateFrom, dateTo);

  const [items, total] = await qb.getManyAndCount();
  res.json({ total, items });
};

export const getRun = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const run = await findRunForUser(id, req.userId);

  if (!run) {
    return res.status(404).json({ error: "Not found" });
  }

  const artifacts = await loadRunArtifacts(id);
  res.json({ run, artifacts });
};

export const deleteRun = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const run = await findRunForUser(id, req.userId);

  if (!run) {
    return res.status(404).json({ error: "Not found" });
  }

  await removeRunDir(id);
  await run.remove();
  res.status(204).send();
};

export const getArtifact = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const artifactName = artifactMap[req.params.name];

  if (!artifactName) {
    return res.status(400).json({ error: "Unknown artifact" });
  }

  const run = await findRunForUser(id, req.userId);
  if (!run) {
    return res.status(404).json({ error: "Not found" });
  }

  const filePath = artifactPath(id, artifactName);
  try {
    await fs.promises.access(filePath);
  } catch {
    return res.status(404).json({ error: "Not found" });
  }

  res.sendFile(filePath);
};

export const getRunImage = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const run = await findRunForUser(id, req.userId);

  if (!run) {
    return res.status(404).json({ error: "Not found" });
  }

  const filePath = imagePath(id, run.imageName);
  try {
    await fs.promises.access(filePath);
  } catch {
    return res.status(404).json({ error: "Not found" });
  }

  res.sendFile(filePath);
};
