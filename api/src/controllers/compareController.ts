import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";
import config from "../../config/default.json";
import { ComparisonRun } from "../entities/ComparisonRun";
import { DocumentType } from "../entities/DocumentType";
import { User } from "../entities/User";
import {
  artifactPath,
  createRunDir,
  imagePath,
  readJson,
  writeJson,
} from "../services/runStorage";

const COMPARE_BASE_URL = String(
  (config as { COMPARE_SERVICE_URL?: string }).COMPARE_SERVICE_URL ?? ""
);
const COMPARE_URL = `${COMPARE_BASE_URL.replace(/\/+$/, "")}/compare`;

function extractTimings(response: any): Record<string, number> | null {
  const raw =
    response?.run_meta?.timings_ms ??
    response?.timings_ms ??
    response?.timings ??
    null;

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const classical = Number(raw.main ?? raw.classical ?? 0);
  const vlm = Number(raw.qwen ?? raw.vlm ?? 0);
  const hybrid = Number(raw.hybrid ?? 0);

  if (
    Number.isNaN(classical) &&
    Number.isNaN(vlm) &&
    Number.isNaN(hybrid)
  ) {
    return null;
  }

  return {
    classical: Number.isNaN(classical) ? 0 : classical,
    vlm: Number.isNaN(vlm) ? 0 : vlm,
    hybrid: Number.isNaN(hybrid) ? 0 : hybrid,
  };
}

function extractMeta(response: any) {
  const meta = response?.run_meta ?? response ?? {};

  return {
    imageW: typeof meta.image_w === "number" ? meta.image_w : null,
    imageH: typeof meta.image_h === "number" ? meta.image_h : null,
    device: meta.device != null ? String(meta.device) : null,
  };
}

function toCompareError(error: any) {
  return {
    message: error?.message ?? "compare service unreachable",
    status: error?.response?.status ?? null,
    data: error?.response?.data ?? null,
  };
}

export async function runCompare(opts: {
  file: Express.Multer.File;
  documentTypeKey: string;
  userId: number | null;
  benchmarkId?: number | null;
}): Promise<{ run: ComparisonRun; response: any }> {
  const { file, documentTypeKey, userId, benchmarkId = null } = opts;

  const documentType = await DocumentType.findOneBy({ key: documentTypeKey });
  if (!documentType) {
    throw {
      statusCode: 400,
      message: `Unknown documentType "${documentTypeKey}"`,
    };
  }

  const user = userId ? await User.findOneBy({ id: userId }) : null;
  const run = ComparisonRun.create({
    user,
    filename: file.originalname,
    storageDir: "",
    imageName: "",
    imageW: null,
    imageH: null,
    device: null,
    documentType: documentType.key,
    timings: null,
    recommended: null,
    benchmarkId,
    hasGroundTruth: false,
    summary: null,
  });
  await run.save();

  run.storageDir = String(run.id);
  run.imageName = `image${path.extname(file.originalname) || ".bin"}`;

  await createRunDir(run.id);
  const destinationImagePath = imagePath(run.id, run.imageName);
  await fs.promises.rename(file.path, destinationImagePath);

  const form = new FormData();
  form.append("file", fs.createReadStream(destinationImagePath), file.originalname);

  let response: any;
  try {
    const compareResponse = await axios.post(COMPARE_URL, form, {
      headers: {
        ...form.getHeaders(),
        "ngrok-skip-browser-warning": "1",
      },
      params: {
        // The backend already stores artifacts locally, so the compare
        // service does not need to write its own copies to disk.
        save_to_disk: false,
      },
      timeout: 180_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    response = compareResponse.data;
  } catch (error) {
    await writeJson(artifactPath(run.id, "raw_response"), {
      ok: false,
      error: toCompareError(error),
    });
    await run.save();
    throw {
      statusCode: 502,
      message: "Compare service failed",
      details: toCompareError(error),
    };
  }

  await writeJson(artifactPath(run.id, "raw_response"), response);
  if (response?.main) {
    await writeJson(artifactPath(run.id, "classical"), response.main);
  }
  if (response?.qwen) {
    await writeJson(artifactPath(run.id, "vlm"), response.qwen);
  }
  if (response?.hybrid) {
    await writeJson(artifactPath(run.id, "hybrid"), response.hybrid);
  }

  const meta = extractMeta(response);
  run.imageW = meta.imageW;
  run.imageH = meta.imageH;
  run.device = meta.device;
  run.timings = extractTimings(response);
  run.recommended =
    response?.recommended_for_production ?? response?.recommended ?? null;
  await run.save();

  return { run, response };
}

export async function loadRunArtifacts(runId: number) {
  const [raw, classical, vlm, hybrid, groundTruth, metrics] = await Promise.all(
    [
      readJson(artifactPath(runId, "raw_response")),
      readJson(artifactPath(runId, "classical")),
      readJson(artifactPath(runId, "vlm")),
      readJson(artifactPath(runId, "hybrid")),
      readJson(artifactPath(runId, "ground_truth")),
      readJson(artifactPath(runId, "metrics")),
    ]
  );

  return { raw, classical, vlm, hybrid, groundTruth, metrics };
}
