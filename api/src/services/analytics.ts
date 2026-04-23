import { SelectQueryBuilder } from "typeorm";
import { ComparisonRun } from "../entities/ComparisonRun";
import { artifactPath, readJson } from "./runStorage";

export interface AnalyticsFilter {
  from?: Date;
  to?: Date;
  documentType?: string;
  userId?: number;
}

function mean(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function applyDateFilters(
  qb: SelectQueryBuilder<ComparisonRun>,
  from?: Date,
  to?: Date
) {
  if (from) {
    qb.andWhere("run.createdAt >= :from", { from: from.toISOString() });
  }

  if (to) {
    qb.andWhere("run.createdAt <= :to", { to: to.toISOString() });
  }
}

export async function fetchRuns(filter: AnalyticsFilter): Promise<ComparisonRun[]> {
  const qb = ComparisonRun.createQueryBuilder("run")
    .leftJoin("run.user", "user")
    .orderBy("run.createdAt", "ASC");

  if (filter.userId) {
    qb.andWhere("user.id = :userId", { userId: filter.userId });
  }

  if (filter.documentType) {
    qb.andWhere("run.documentType = :documentType", {
      documentType: filter.documentType,
    });
  }

  applyDateFilters(qb, filter.from, filter.to);

  return qb.getMany();
}

export function computeKpis(runs: ComparisonRun[]) {
  const approaches = ["classical", "vlm", "hybrid"] as const;

  return approaches.map((approach) => {
    const scores = runs
      .map((run) => run.summary?.[approach])
      .filter((value): value is number => typeof value === "number");
    const latencies = runs
      .map((run) => run.timings?.[approach])
      .filter((value): value is number => typeof value === "number");

    return {
      approach,
      scoredCount: scores.length,
      meanAccuracy: mean(scores),
      meanLatencyMs: mean(latencies),
    };
  });
}

export async function computePerFieldAccuracy(runs: ComparisonRun[]) {
  const aggregate: Record<
    string,
    Record<string, { sum: number; count: number }>
  > = {};

  for (const run of runs) {
    if (!run.hasGroundTruth) {
      continue;
    }

    const metrics = await readJson<any>(artifactPath(run.id, "metrics"));
    if (!metrics?.perApproach) {
      continue;
    }

    for (const approach of ["classical", "vlm", "hybrid"] as const) {
      const fields = metrics.perApproach?.[approach]?.fields;
      if (!Array.isArray(fields)) {
        continue;
      }

      for (const field of fields) {
        if (!field || typeof field.key !== "string") {
          continue;
        }

        if (!aggregate[field.key]) {
          aggregate[field.key] = {};
        }

        if (!aggregate[field.key][approach]) {
          aggregate[field.key][approach] = { sum: 0, count: 0 };
        }

        aggregate[field.key][approach].sum += Number(field.score ?? 0);
        aggregate[field.key][approach].count += 1;
      }
    }
  }

  return Object.entries(aggregate)
    .map(([field, byApproach]) => ({
      field,
      classical: byApproach.classical
        ? byApproach.classical.sum / byApproach.classical.count
        : null,
      vlm: byApproach.vlm ? byApproach.vlm.sum / byApproach.vlm.count : null,
      hybrid: byApproach.hybrid
        ? byApproach.hybrid.sum / byApproach.hybrid.count
        : null,
    }))
    .sort((left, right) => left.field.localeCompare(right.field));
}
