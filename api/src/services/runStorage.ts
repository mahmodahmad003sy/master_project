import fs from "fs";
import path from "path";
import config from "../../config/default.json";

export const RUNS_ROOT: string = config.RUNS_BASE_PATH;

export type ArtifactName =
  | "raw_response"
  | "classical"
  | "vlm"
  | "hybrid"
  | "ground_truth"
  | "metrics";

export async function ensureRunsRoot(): Promise<void> {
  await fs.promises.mkdir(RUNS_ROOT, { recursive: true });
}

export function runDir(runId: number | string): string {
  return path.join(RUNS_ROOT, String(runId));
}

export function artifactPath(
  runId: number | string,
  name: ArtifactName
): string {
  return path.join(runDir(runId), `${name}.json`);
}

export function imagePath(runId: number | string, imageName: string): string {
  return path.join(runDir(runId), imageName);
}

export function benchmarkDir(benchmarkId: number | string): string {
  return path.join(RUNS_ROOT, "benchmarks", String(benchmarkId));
}

export async function createRunDir(runId: number | string): Promise<void> {
  await fs.promises.mkdir(runDir(runId), { recursive: true });
}

export async function writeJson(
  filePath: string,
  data: unknown
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.promises.rename(tmpPath, filePath);
}

export async function readJson<T = unknown>(
  filePath: string
): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeRunDir(runId: number | string): Promise<void> {
  await fs.promises.rm(runDir(runId), { recursive: true, force: true });
}
