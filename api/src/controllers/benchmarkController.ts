import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { Response } from "express";
import { Benchmark } from "../entities/Benchmark";
import { ComparisonRun } from "../entities/ComparisonRun";
import { DocumentType } from "../entities/DocumentType";
import { User } from "../entities/User";
import { startBenchmarkWorker } from "../services/benchmarkWorker";
import {
  benchmarkDir,
  benchmarkGtPath,
  benchmarkImagesDir,
  benchmarkReportPath,
  ensureBenchmarkDir,
} from "../services/benchmarkStorage";
import { toCsv } from "../services/reportExport";
import { readJson, removeRunDir, writeJson } from "../services/runStorage";
import { AuthRequest } from "../utils/authMiddleware";

async function findBenchmarkForUser(id: number, userId?: number) {
  const benchmark = await Benchmark.findOne(id, {
    relations: ["user"],
  });

  if (!benchmark) {
    return null;
  }

  if (userId && benchmark.user && benchmark.user.id !== userId) {
    return null;
  }

  return benchmark;
}

async function deleteIfExists(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }
}

export const createBenchmark = async (req: AuthRequest, res: Response) => {
  const name = String(req.body?.name ?? "").trim();
  const documentTypeKey = String(req.body?.documentType ?? "").trim();

  if (!name || !documentTypeKey) {
    return res
      .status(400)
      .json({ error: "name and documentType are required" });
  }

  const documentType = await DocumentType.findOne({ key: documentTypeKey });
  if (!documentType) {
    return res.status(400).json({ error: "Unknown document type" });
  }

  const user = req.userId ? await User.findOne({ id: req.userId }) : null;
  const benchmark = Benchmark.create({
    name,
    documentType: documentType.key,
    storageDir: "",
    status: "draft",
    totalItems: 0,
    doneItems: 0,
    failedItems: 0,
    summaryPath: null,
    user,
  });

  await benchmark.save();
  benchmark.storageDir = String(benchmark.id);
  await benchmark.save();
  await ensureBenchmarkDir(benchmark.id);

  res.status(201).json(benchmark);
};

export const listBenchmarks = async (req: AuthRequest, res: Response) => {
  const qb = Benchmark.createQueryBuilder("benchmark")
    .leftJoinAndSelect("benchmark.user", "user")
    .orderBy("benchmark.createdAt", "DESC");

  if (req.userId) {
    qb.andWhere("user.id = :userId", { userId: req.userId });
  }

  const items = await qb.getMany();
  res.json(items);
};

export const getBenchmark = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const benchmark = await findBenchmarkForUser(id, req.userId);
  if (!benchmark) {
    return res.status(404).json({ error: "Not found" });
  }

  const [items, report] = await Promise.all([
    ComparisonRun.find({
      where: { benchmarkId: id },
      order: { id: "ASC" },
    }),
    readJson(benchmarkReportPath(id)),
  ]);

  res.json({ benchmark, items, report });
};

export const uploadBenchmarkItems = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const benchmark = await findBenchmarkForUser(id, req.userId);
  if (!benchmark) {
    return res.status(404).json({ error: "Not found" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Zip file is required" });
  }

  const existingRuns = await ComparisonRun.count({ benchmarkId: id });
  if (benchmark.status === "running" || existingRuns > 0) {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    return res.status(409).json({
      error: "Benchmark items cannot be changed after execution starts",
    });
  }

  await ensureBenchmarkDir(id);
  await fs.promises.rm(benchmarkImagesDir(id), {
    recursive: true,
    force: true,
  });
  await ensureBenchmarkDir(id);
  await deleteIfExists(benchmarkGtPath(id));
  await deleteIfExists(benchmarkReportPath(id));

  const zip = new AdmZip(req.file.path);

  try {
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) {
        continue;
      }

      const baseName = path.basename(entry.entryName);
      if (baseName === "ground_truth.json") {
        const rawGroundTruth = entry
          .getData()
          .toString("utf-8")
          .replace(/^\uFEFF/, "");
        const groundTruth = JSON.parse(rawGroundTruth);
        await writeJson(benchmarkGtPath(id), groundTruth);
        continue;
      }

      if (!/\.(jpe?g|png|webp|bmp)$/i.test(baseName)) {
        continue;
      }

      const destinationPath = path.join(benchmarkImagesDir(id), baseName);
      await fs.promises.writeFile(destinationPath, entry.getData());
    }
  } finally {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
  }

  const uploadedFiles = (
    await fs.promises.readdir(benchmarkImagesDir(id))
  ).filter((name) => /\.(jpe?g|png|webp|bmp)$/i.test(name));

  benchmark.totalItems = uploadedFiles.length;
  benchmark.doneItems = 0;
  benchmark.failedItems = 0;
  benchmark.summaryPath = null;
  benchmark.status = "draft";
  await benchmark.save();

  res.json({ benchmark, uploadedFiles });
};

export const runBenchmark = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const benchmark = await findBenchmarkForUser(id, req.userId);
  if (!benchmark) {
    return res.status(404).json({ error: "Not found" });
  }

  if (benchmark.status === "running") {
    return res.json({ started: true, status: "running" });
  }

  if (!benchmark.totalItems) {
    return res.status(400).json({ error: "Upload benchmark items first" });
  }

  const existingRuns = await ComparisonRun.count({ benchmarkId: id });
  if (existingRuns > 0) {
    return res.status(409).json({
      error: "Benchmark already executed; create a new benchmark to rerun",
    });
  }

  benchmark.status = "running";
  benchmark.doneItems = 0;
  benchmark.failedItems = 0;
  benchmark.summaryPath = null;
  await benchmark.save();

  void startBenchmarkWorker(id).catch((error) => {
    console.error("Benchmark worker failed", error);
  });

  res.json({ started: true, benchmark });
};

export const exportBenchmarkCsv = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const benchmark = await findBenchmarkForUser(id, req.userId);
  if (!benchmark) {
    return res.status(404).json({ error: "Not found" });
  }

  const items = await ComparisonRun.find({
    where: { benchmarkId: id },
    order: { id: "ASC" },
  });
  const csv = toCsv(items);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="benchmark-${id}.csv"`,
  );
  res.send(csv);
};

export const deleteBenchmark = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const benchmark = await findBenchmarkForUser(id, req.userId);
  if (!benchmark) {
    return res.status(404).json({ error: "Not found" });
  }

  if (benchmark.status === "running") {
    return res.status(409).json({ error: "Cannot delete a running benchmark" });
  }

  const runs = await ComparisonRun.find({ where: { benchmarkId: id } });
  for (const run of runs) {
    await removeRunDir(run.id);
    await run.remove();
  }

  await fs.promises.rm(benchmarkDir(id), { recursive: true, force: true });
  await benchmark.remove();

  res.status(204).send();
};
