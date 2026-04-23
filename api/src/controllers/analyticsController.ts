import { Response } from "express";
import {
  AnalyticsFilter,
  computeKpis,
  computePerFieldAccuracy,
  fetchRuns,
} from "../services/analytics";
import { AuthRequest } from "../utils/authMiddleware";

function parseDate(label: string, value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw { statusCode: 400, message: `Invalid ${label} "${value}"` };
  }

  return parsed;
}

function parseFilter(req: AuthRequest): AnalyticsFilter {
  const query = req.query as Record<string, string | undefined>;

  return {
    from: parseDate("from", query.from),
    to: parseDate("to", query.to),
    documentType: query.documentType || undefined,
    userId: req.userId,
  };
}

export const analyticsSummary = async (req: AuthRequest, res: Response) => {
  const filter = parseFilter(req);
  const runs = await fetchRuns(filter);
  const [perField] = await Promise.all([computePerFieldAccuracy(runs)]);

  res.json({
    totalRuns: runs.length,
    withGroundTruth: runs.filter((run) => run.hasGroundTruth).length,
    kpis: computeKpis(runs),
    perField,
  });
};
