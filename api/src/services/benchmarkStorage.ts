import fs from "fs";
import path from "path";
import { benchmarkDir as baseBenchmarkDir } from "./runStorage";

export function benchmarkDir(id: number | string): string {
  return baseBenchmarkDir(id);
}

export function benchmarkImagesDir(id: number | string): string {
  return path.join(benchmarkDir(id), "images");
}

export function benchmarkGtPath(id: number | string): string {
  return path.join(benchmarkDir(id), "ground_truth.json");
}

export function benchmarkReportPath(id: number | string): string {
  return path.join(benchmarkDir(id), "report.json");
}

export function benchmarkTempDir(id: number | string): string {
  return path.join(benchmarkDir(id), "_tmp");
}

export async function ensureBenchmarkDir(id: number | string): Promise<void> {
  await fs.promises.mkdir(benchmarkImagesDir(id), { recursive: true });
  await fs.promises.mkdir(benchmarkTempDir(id), { recursive: true });
}
