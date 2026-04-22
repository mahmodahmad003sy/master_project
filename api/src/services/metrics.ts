const munkres = require("munkres-js") as (matrix: number[][]) => number[][];

export type FieldType = "text" | "number" | "money" | "date";

export interface FieldSpec {
  key: string;
  type: FieldType;
  formats?: string[];
  tolerance?: number;
  label?: string;
}

export interface ArraySpec {
  key: string;
  rowKey: string;
  match?: "hungarian";
  fields: FieldSpec[];
  label?: string;
}

export interface Schema {
  fields: FieldSpec[];
  arrays: ArraySpec[];
}

export type MatchStatus =
  | "exact"
  | "fuzzy"
  | "miss"
  | "missing_gt"
  | "missing_pred";

export interface FieldScore {
  key: string;
  status: MatchStatus;
  predicted: unknown;
  expected: unknown;
  score: number;
}

export interface ArrayRowScore {
  index: number;
  fields: FieldScore[];
  score: number;
}

export interface ApproachScore {
  fields: FieldScore[];
  arrays: Record<string, ArrayRowScore[]>;
  meanFieldScore: number;
  counts: { exact: number; fuzzy: number; miss: number; total: number };
}

export type ApproachKey = "classical" | "vlm" | "hybrid";

export interface RunMetrics {
  perApproach: Record<ApproachKey, ApproachScore | null>;
  summary: Record<ApproachKey, number>;
}

export function normalizeText(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  const normalized = String(value)
    .replace(/[^\d.,-]/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDate(value: unknown, _formats?: string[]): string | null {
  if (value == null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  let match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const [, dd, mm, yy] = match;
    const year = yy.length === 2 ? 2000 + Number.parseInt(yy, 10) : Number.parseInt(yy, 10);
    const day = Number.parseInt(dd, 10);
    const month = Number.parseInt(mm, 10);

    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return raw;
  }

  return null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  const previous = new Array(b.length + 1).fill(0);
  const current = new Array(b.length + 1).fill(0);

  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

export function cer(predicted: string, expected: string): number {
  if (!expected) {
    return predicted ? 1 : 0;
  }

  const distance = levenshtein(predicted, expected);
  return Math.min(1, distance / Math.max(1, expected.length));
}

export function fieldMatch(predicted: unknown, expected: unknown, spec: FieldSpec): FieldScore {
  const base = {
    key: spec.key,
    predicted,
    expected,
  };

  const expectedMissing = expected === undefined || expected === null || expected === "";
  const predictedMissing = predicted === undefined || predicted === null || predicted === "";

  if (expectedMissing) {
    return { ...base, status: "missing_gt", score: 0 };
  }

  if (predictedMissing) {
    return { ...base, status: "missing_pred", score: 0 };
  }

  if (spec.type === "number" || spec.type === "money") {
    const predValue = normalizeNumber(predicted);
    const expectedValue = normalizeNumber(expected);

    if (predValue == null || expectedValue == null) {
      return { ...base, status: "miss", score: 0 };
    }

    const tolerance = spec.tolerance ?? 0;
    if (Math.abs(predValue - expectedValue) <= tolerance) {
      return { ...base, status: "exact", score: 1 };
    }

    const diff = Math.abs(predValue - expectedValue) / Math.max(1, Math.abs(expectedValue));
    return { ...base, status: "miss", score: Math.max(0, 1 - diff) };
  }

  if (spec.type === "date") {
    const predValue = normalizeDate(predicted, spec.formats);
    const expectedValue = normalizeDate(expected, spec.formats);

    if (predValue && expectedValue && predValue === expectedValue) {
      return { ...base, status: "exact", score: 1 };
    }

    return { ...base, status: "miss", score: 0 };
  }

  const predValue = normalizeText(predicted);
  const expectedValue = normalizeText(expected);

  if (predValue === expectedValue) {
    return { ...base, status: "exact", score: 1 };
  }

  const error = cer(predValue, expectedValue);
  if (error <= 0.2) {
    return { ...base, status: "fuzzy", score: 1 - error };
  }

  return { ...base, status: "miss", score: Math.max(0, 1 - error) };
}

export function orderMatch(predictedRows: any[], expectedRows: any[], spec: ArraySpec): ArrayRowScore[] {
  const size = Math.max(predictedRows.length, expectedRows.length);
  if (size === 0) {
    return [];
  }

  const costMatrix: number[][] = Array.from({ length: size }, () =>
    Array(size).fill(1)
  );

  for (let i = 0; i < predictedRows.length; i += 1) {
    for (let j = 0; j < expectedRows.length; j += 1) {
      const predictedKey = normalizeText(predictedRows[i]?.[spec.rowKey]);
      const expectedKey = normalizeText(expectedRows[j]?.[spec.rowKey]);
      costMatrix[i][j] = predictedKey && expectedKey ? cer(predictedKey, expectedKey) : 1;
    }
  }

  const assignments = munkres(costMatrix);

  return assignments
    .map(([predictedIndex, expectedIndex]: number[]) => {
      const predictedRow = predictedRows[predictedIndex];
      const expectedRow = expectedRows[expectedIndex];

      if (!predictedRow || !expectedRow) {
        return null;
      }

      const fields = spec.fields.map((field) =>
        fieldMatch(predictedRow[field.key], expectedRow[field.key], field)
      );
      const scoredFields = fields.filter((field) => field.status !== "missing_gt");
      const score = scoredFields.length
        ? scoredFields.reduce((sum, field) => sum + field.score, 0) / scoredFields.length
        : 0;

      return {
        index: predictedIndex,
        fields,
        score,
      };
    })
    .filter((row: ArrayRowScore | null): row is ArrayRowScore => row !== null);
}

export function scoreApproach(approachResult: any, expected: any, schema: Schema): ApproachScore {
  const predictedFields =
    approachResult?.fields && typeof approachResult.fields === "object"
      ? approachResult.fields
      : approachResult && typeof approachResult === "object"
        ? approachResult
        : {};
  const expectedFields = expected && typeof expected === "object" ? expected : {};

  const fields = schema.fields.map((field) =>
    fieldMatch(predictedFields[field.key], expectedFields[field.key], field)
  );

  const arrays: Record<string, ArrayRowScore[]> = {};
  schema.arrays.forEach((arraySpec) => {
    arrays[arraySpec.key] = orderMatch(
      Array.isArray(predictedFields[arraySpec.key]) ? predictedFields[arraySpec.key] : [],
      Array.isArray(expectedFields[arraySpec.key]) ? expectedFields[arraySpec.key] : [],
      arraySpec
    );
  });

  const scoredFieldValues = fields
    .filter((field) => field.status !== "missing_gt")
    .map((field) => field.score);
  const arrayScores = Object.values(arrays).flat().map((row) => row.score);
  const allScores = [...scoredFieldValues, ...arrayScores];

  const counts = fields.reduce(
    (acc, field) => {
      if (field.status === "missing_gt") {
        return acc;
      }

      acc.total += 1;
      if (field.status === "exact") {
        acc.exact += 1;
      } else if (field.status === "fuzzy") {
        acc.fuzzy += 1;
      } else {
        acc.miss += 1;
      }
      return acc;
    },
    { exact: 0, fuzzy: 0, miss: 0, total: 0 }
  );

  return {
    fields,
    arrays,
    meanFieldScore: allScores.length
      ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length
      : 0,
    counts,
  };
}

export function scoreRun(
  artifacts: { classical: any; vlm: any; hybrid: any },
  expected: any,
  schema: Schema
): RunMetrics {
  const perApproach: RunMetrics["perApproach"] = {
    classical: artifacts.classical ? scoreApproach(artifacts.classical, expected, schema) : null,
    vlm: artifacts.vlm ? scoreApproach(artifacts.vlm, expected, schema) : null,
    hybrid: artifacts.hybrid ? scoreApproach(artifacts.hybrid, expected, schema) : null,
  };

  return {
    perApproach,
    summary: {
      classical: perApproach.classical?.meanFieldScore ?? 0,
      vlm: perApproach.vlm?.meanFieldScore ?? 0,
      hybrid: perApproach.hybrid?.meanFieldScore ?? 0,
    },
  };
}
