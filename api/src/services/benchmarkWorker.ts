import fs from "fs";
import path from "path";
import { Benchmark } from "../entities/Benchmark";
import { ComparisonRun } from "../entities/ComparisonRun";
import { DocumentType } from "../entities/DocumentType";
import { Schema, scoreRun } from "./metrics";
import {
  benchmarkGtPath,
  benchmarkImagesDir,
  benchmarkReportPath,
  benchmarkTempDir,
  ensureBenchmarkDir,
} from "./benchmarkStorage";
import { artifactPath, readJson, writeJson } from "./runStorage";
import { runCompare } from "../controllers/compareController";

type AggregateApproach = "classical" | "vlm" | "hybrid";

const runningBenchmarks = new Set<number>();

function imageMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

function mean(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[index];
}

export function aggregateReport(runs: ComparisonRun[]) {
  const approaches: AggregateApproach[] = ["classical", "vlm", "hybrid"];
  const timings: Record<AggregateApproach, number[]> = {
    classical: [],
    vlm: [],
    hybrid: [],
  };
  const scores: Record<AggregateApproach, number[]> = {
    classical: [],
    vlm: [],
    hybrid: [],
  };

  for (const run of runs) {
    for (const approach of approaches) {
      const timing = run.timings?.[approach];
      if (typeof timing === "number") {
        timings[approach].push(timing);
      }

      const score = run.summary?.[approach];
      if (typeof score === "number") {
        scores[approach].push(score);
      }
    }
  }

  return {
    total: runs.length,
    perApproach: approaches.map((approach) => ({
      approach,
      accuracyMean: mean(scores[approach]),
      latencyMeanMs: mean(timings[approach]),
      latencyP50Ms: percentile(timings[approach], 0.5),
      latencyP95Ms: percentile(timings[approach], 0.95),
      scoredCount: scores[approach].length,
    })),
  };
}

async function scoreBenchmarkRun(
  run: ComparisonRun,
  filename: string,
  schema: Schema,
  gtMap: Record<string, unknown>
) {
  const groundTruth = gtMap[filename];
  if (!groundTruth) {
    return;
  }

  await writeJson(artifactPath(run.id, "ground_truth"), groundTruth);

  const [classical, vlm, hybrid] = await Promise.all([
    readJson(artifactPath(run.id, "classical")),
    readJson(artifactPath(run.id, "vlm")),
    readJson(artifactPath(run.id, "hybrid")),
  ]);

  const metrics = scoreRun({ classical, vlm, hybrid }, groundTruth, schema);
  await writeJson(artifactPath(run.id, "metrics"), metrics);

  run.hasGroundTruth = true;
  run.summary = metrics.summary;
  await run.save();
}

async function createTempCompareFile(
  benchmarkId: number,
  imagePath: string,
  filename: string
): Promise<Express.Multer.File> {
  await ensureBenchmarkDir(benchmarkId);

  const tempName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(
    filename
  )}`;
  const tempPath = path.join(benchmarkTempDir(benchmarkId), tempName);
  await fs.promises.copyFile(imagePath, tempPath);
  const stats = await fs.promises.stat(tempPath);

  return {
    fieldname: "file",
    originalname: filename,
    encoding: "7bit",
    mimetype: imageMimeType(filename),
    destination: benchmarkTempDir(benchmarkId),
    filename: tempName,
    path: tempPath,
    size: stats.size,
    stream: fs.createReadStream(tempPath) as any,
    buffer: Buffer.alloc(0),
  };
}

async function runBenchmarkItems(benchmark: Benchmark): Promise<void> {
  const documentType = await DocumentType.findOneBy({ key: benchmark.documentType });
  if (!documentType) {
    throw new Error(`Unknown documentType "${benchmark.documentType}"`);
  }

  await ensureBenchmarkDir(benchmark.id);
  const gtMap =
    (await readJson<Record<string, unknown>>(benchmarkGtPath(benchmark.id))) ?? {};
  const files = (await fs.promises.readdir(benchmarkImagesDir(benchmark.id))).filter((name) =>
    /\.(jpe?g|png|webp|bmp)$/i.test(name)
  );

  benchmark.totalItems = files.length;
  benchmark.doneItems = 0;
  benchmark.failedItems = 0;
  benchmark.summaryPath = null;
  benchmark.status = "running";
  await benchmark.save();

  for (const filename of files) {
    const sourceImagePath = path.join(benchmarkImagesDir(benchmark.id), filename);

    try {
      const fakeFile = await createTempCompareFile(
        benchmark.id,
        sourceImagePath,
        filename
      );
      const { run } = await runCompare({
        file: fakeFile,
        documentTypeKey: benchmark.documentType,
        userId: benchmark.user?.id ?? null,
        benchmarkId: benchmark.id,
      });

      await scoreBenchmarkRun(
        run,
        filename,
        documentType.schema as unknown as Schema,
        gtMap
      );

      benchmark.doneItems += 1;
    } catch {
      benchmark.failedItems += 1;
    }

    await benchmark.save();
  }

  const runs = await ComparisonRun.find({
    where: { benchmarkId: benchmark.id },
    order: { id: "ASC" },
  });
  const report = aggregateReport(runs);
  await writeJson(benchmarkReportPath(benchmark.id), report);

  benchmark.summaryPath = "report.json";
  benchmark.status = "done";
  await benchmark.save();
}

export async function startBenchmarkWorker(benchmarkId: number): Promise<void> {
  if (runningBenchmarks.has(benchmarkId)) {
    return;
  }

  runningBenchmarks.add(benchmarkId);

  try {
    const benchmark = await Benchmark.findOne({
      where: { id: benchmarkId },
      relations: { user: true },
    });

    if (!benchmark) {
      throw new Error("Benchmark not found");
    }

    await runBenchmarkItems(benchmark);
  } catch (error) {
    const benchmark = await Benchmark.findOneBy({ id: benchmarkId });
    if (benchmark) {
      benchmark.status = "failed";
      await benchmark.save();
    }
    throw error;
  } finally {
    runningBenchmarks.delete(benchmarkId);
  }
}

export function isBenchmarkRunning(benchmarkId: number): boolean {
  return runningBenchmarks.has(benchmarkId);
}
