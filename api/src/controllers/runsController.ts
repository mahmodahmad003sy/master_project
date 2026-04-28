import AdmZip from "adm-zip";
import fs from "fs";
import { Request, Response } from "express";
import { SelectQueryBuilder } from "typeorm";
import { ComparisonRun } from "../entities/ComparisonRun";
import { DocumentType } from "../entities/DocumentType";
import { Schema, scoreRun } from "../services/metrics";
import {
  ArtifactName,
  artifactPath,
  imagePath,
  readJson,
  removeRunDir,
  writeJson,
} from "../services/runStorage";
import { signShareToken, verifyShareToken } from "../utils/shareToken";
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

function parseRunIdsParam(value: string | undefined): number[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function applyDateFilters(
  qb: SelectQueryBuilder<ComparisonRun>,
  dateFrom: Date | null,
  dateTo: Date | null,
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

function buildRunsQuery(
  req: AuthRequest,
  query: Record<string, string | undefined>,
  options?: {
    includePagination?: boolean;
    forceHasGroundTruth?: boolean;
    explicitRunIds?: number[];
  },
) {
  const limit = Math.min(parseIntegerParam(query.limit, 20), 200);
  const offset = parseIntegerParam(query.offset, 0);
  const dateFrom = parseDateParam("dateFrom", query.dateFrom);
  const dateTo = parseDateParam("dateTo", query.dateTo);

  const qb = ComparisonRun.createQueryBuilder("run")
    .leftJoin("run.user", "user")
    .orderBy("run.createdAt", "DESC");

  if (options?.includePagination !== false) {
    qb.take(limit).skip(offset);
  }

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

  if (options?.explicitRunIds?.length) {
    qb.andWhere("run.id IN (:...runIds)", {
      runIds: options.explicitRunIds,
    });
  }

  if (options?.forceHasGroundTruth) {
    qb.andWhere("run.hasGroundTruth = true");
  } else if (query.hasGroundTruth === "true") {
    qb.andWhere("run.hasGroundTruth = true");
  } else if (query.hasGroundTruth === "false") {
    qb.andWhere("run.hasGroundTruth = false");
  }

  applyDateFilters(qb, dateFrom, dateTo);

  return { qb, limit, offset, dateFrom, dateTo };
}

async function findRunForUser(id: number, userId?: number) {
  const run = await ComparisonRun.findOne(id, {
    relations: ["user"],
  });

  if (!run) {
    return null;
  }

  if (userId && run.user && run.user.id !== userId) {
    return null;
  }

  return run;
}

async function findRunById(id: number) {
  return ComparisonRun.findOne({ id });
}

async function recomputeAndPersistMetrics(runId: number) {
  const run = await ComparisonRun.findOne({ id: runId });
  if (!run) {
    return;
  }

  const groundTruth = await readJson(artifactPath(runId, "ground_truth"));
  if (!groundTruth) {
    run.hasGroundTruth = false;
    run.summary = null;
    await run.save();
    return;
  }

  const documentType = await DocumentType.findOne({ key: run.documentType });
  if (!documentType) {
    return;
  }

  const [classical, vlm, hybrid] = await Promise.all([
    readJson(artifactPath(runId, "classical")),
    readJson(artifactPath(runId, "vlm")),
    readJson(artifactPath(runId, "hybrid")),
  ]);

  const metrics = scoreRun(
    { classical, vlm, hybrid },
    groundTruth,
    documentType.schema as unknown as Schema,
  );

  await writeJson(artifactPath(runId, "metrics"), metrics);
  run.hasGroundTruth = true;
  run.summary = metrics.summary;
  await run.save();
}

export const postCompare = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw { statusCode: 400, message: "No file uploaded" };
  }

  const documentType = String(
    req.body.documentType ?? req.query.documentType ?? "",
  );
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
  const { qb } = buildRunsQuery(req, query);

  const [items, total] = await qb.getManyAndCount();
  res.json({ total, items });
};

export const exportGroundTruthDataset = async (
  req: AuthRequest,
  res: Response,
) => {
  const query = req.query as Record<string, string | undefined>;
  const explicitRunIds = parseRunIdsParam(query.runIds);

  if (query.hasGroundTruth === "false") {
    throw {
      statusCode: 400,
      message: "ground-truth export requires runs that have ground truth",
    };
  }

  const { qb } = buildRunsQuery(req, query, {
    includePagination: false,
    forceHasGroundTruth: true,
    explicitRunIds,
  });
  const runs = await qb.getMany();

  const zip: any = new AdmZip();
  const manifest: Array<Record<string, unknown>> = [];
  const skippedRuns: Array<Record<string, unknown>> = [];

  for (const run of runs) {
    const groundTruth = await readJson(artifactPath(run.id, "ground_truth"));
    if (!groundTruth) {
      if (run.hasGroundTruth) {
        run.hasGroundTruth = false;
        run.summary = null;
        await run.save();
      }

      skippedRuns.push({
        id: run.id,
        filename: run.filename,
        documentType: run.documentType,
        reason: "ground_truth.json is missing",
      });
      continue;
    }

    const folder = `runs/${run.id}`;
    const metadata = {
      id: run.id,
      filename: run.filename,
      documentType: run.documentType,
      documentTypeVersion: run.documentTypeVersion ?? null,
      detectorModelId: run.detectorModelId ?? null,
      detectorModelVersion: run.detectorModelVersion ?? null,
      createdAt: run.createdAt,
      hasGroundTruth: run.hasGroundTruth,
    };

    zip.addFile(
      `${folder}/ground_truth.json`,
      Buffer.from(JSON.stringify(groundTruth, null, 2), "utf-8"),
    );
    zip.addFile(
      `${folder}/metadata.json`,
      Buffer.from(JSON.stringify(metadata, null, 2), "utf-8"),
    );

    const sourceImagePath = imagePath(run.id, run.imageName);
    if (fs.existsSync(sourceImagePath)) {
      zip.addLocalFile(sourceImagePath, folder, run.imageName);
    }

    manifest.push(metadata);
  }

  zip.addFile(
    "manifest.json",
    Buffer.from(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          filters: {
            search: query.search ?? null,
            documentType: query.documentType ?? null,
            hasGroundTruth: true,
            dateFrom: query.dateFrom ?? null,
            dateTo: query.dateTo ?? null,
          },
          totalRuns: manifest.length,
          runs: manifest,
          skippedRuns,
        },
        null,
        2,
      ),
      "utf-8",
    ),
  );

  if (manifest.length === 0) {
    zip.addFile(
      "README.txt",
      Buffer.from(
        [
          "No exportable ground truth artifacts were found for the selected runs.",
          "See manifest.json for skipped run details.",
        ].join("\n"),
        "utf-8",
      ),
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ground-truth-dataset-${timestamp}.zip"`,
  );
  res.send(zip.toBuffer());
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

export const createShareLink = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const run = await findRunForUser(id, req.userId);

  if (!run) {
    return res.status(404).json({ error: "Not found" });
  }

  const rawTtl = Number(req.query.ttl ?? 24);
  const ttl =
    Number.isFinite(rawTtl) && rawTtl > 0 ? Math.min(rawTtl, 24 * 30) : 24;
  const token = signShareToken(id, ttl);

  res.json({
    token,
    url: `/demo/${id}?token=${encodeURIComponent(token)}`,
    expiresInHours: ttl,
  });
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

export const putGroundTruth = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const run = await findRunForUser(id, req.userId);

  if (!run) {
    return res.status(404).json({ error: "Not found" });
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Body must be a JSON object" });
  }

  await writeJson(artifactPath(id, "ground_truth"), req.body);
  await recomputeAndPersistMetrics(id);

  const updatedRun = await ComparisonRun.findOne({ id });
  const [groundTruth, metrics] = await Promise.all([
    readJson(artifactPath(id, "ground_truth")),
    readJson(artifactPath(id, "metrics")),
  ]);

  res.json({ run: updatedRun, groundTruth, metrics });
};

export const deleteGroundTruth = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const run = await findRunForUser(id, req.userId);

  if (!run) {
    return res.status(404).json({ error: "Not found" });
  }

  for (const name of ["ground_truth", "metrics"] as const) {
    const filePath = artifactPath(id, name);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  run.hasGroundTruth = false;
  run.summary = null;
  await run.save();
  res.json({ run });
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

export const getPublicRun = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (!verifyShareToken(token, id)) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const run = await findRunById(id);
  if (!run) {
    return res.status(404).json({ error: "Not found" });
  }

  const [artifacts, documentType] = await Promise.all([
    loadRunArtifacts(id),
    DocumentType.findOne({ key: run.documentType }),
  ]);

  res.json({
    run,
    artifacts,
    documentType,
  });
};

export const getPublicImage = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (!verifyShareToken(token, id)) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const run = await findRunById(id);
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
