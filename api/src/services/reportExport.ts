import { ComparisonRun } from "../entities/ComparisonRun";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export function toCsv(runs: ComparisonRun[]): string {
  const header = [
    "runId",
    "filename",
    "hasGroundTruth",
    "score_classical",
    "score_vlm",
    "score_hybrid",
    "time_classical_ms",
    "time_vlm_ms",
    "time_hybrid_ms",
    "recommended",
  ];

  const rows = runs.map((run) =>
    [
      run.id,
      run.filename,
      run.hasGroundTruth,
      run.summary?.classical,
      run.summary?.vlm,
      run.summary?.hybrid,
      run.timings?.classical,
      run.timings?.vlm,
      run.timings?.hybrid,
      run.recommended,
    ]
      .map(csvCell)
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}
