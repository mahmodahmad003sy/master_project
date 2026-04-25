import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";
import config from "../../config/default.json";
import { ComparisonRun } from "../entities/ComparisonRun";
import { DocumentType } from "../entities/DocumentType";
import { Model } from "../entities/Model";
import { User } from "../entities/User";
import {
  artifactPath,
  createRunDir,
  imagePath,
  readJson,
  writeJson,
} from "../services/runStorage";

const COMPARE_BASE_URL = String(
  (config as { COMPARE_SERVICE_URL?: string }).COMPARE_SERVICE_URL ?? "",
);
const COMPARE_URL = `${COMPARE_BASE_URL.replace(/\/+$/, "")}/compare`;
const COMPARE_TIMEOUT_MS = 10 * 60 * 1000;
const PUBLIC_API_URL = String(config.PUBLIC_API_URL ?? "").replace(/\/+$/, "");
const COLAB_SYNC_TOKEN = String(config.COLAB_SYNC_TOKEN ?? "");

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

  if (Number.isNaN(classical) && Number.isNaN(vlm) && Number.isNaN(hybrid)) {
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
    code: error?.code ?? null,
  };
}

function shouldRetryCompareRequest(error: any): boolean {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();

  if (["ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "EPIPE"].includes(code)) {
    return true;
  }

  return (
    message.includes("socket hang up") ||
    message.includes("connection was aborted") ||
    message.includes("send failure")
  );
}

function extractErrorReason(error: any): string {
  const data = error?.response?.data;

  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error.trim();
    }
    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail.trim();
    }
  }

  return "unknown reason";
}

function mapCompareServiceError(error: any) {
  const status = Number(error?.response?.status ?? 0);

  if (status === 400) {
    return {
      statusCode: 502,
      message: `compare service rejected request: ${extractErrorReason(error)}`,
      details: toCompareError(error),
    };
  }

  if (status >= 500) {
    return {
      statusCode: 502,
      message: `compare service failed: ${status}`,
      details: toCompareError(error),
    };
  }

  if (!status) {
    return {
      statusCode: 503,
      message: "compare service unreachable",
      details: toCompareError(error),
    };
  }

  return {
    statusCode: 502,
    message: `compare service failed: ${status}`,
    details: toCompareError(error),
  };
}

async function postCompareRequest(
  destinationImagePath: string,
  originalname: string,
  documentType: DocumentType,
  model: Model,
  mimetype?: string | null,
): Promise<any> {
  const fileBuffer = await fs.promises.readFile(destinationImagePath);
  const form = new FormData();
  form.append("file", fileBuffer, {
    filename: originalname,
    contentType: mimetype || "application/octet-stream",
    knownLength: fileBuffer.length,
  });
  form.append("documentTypeKey", documentType.key);
  form.append("documentTypeVersion", String(documentType.version ?? 1));
  form.append("schema", JSON.stringify(documentType.schema ?? {}));
  form.append("promptTemplate", documentType.promptTemplate ?? "");
  form.append("promptVersion", String(documentType.version ?? 1));
  form.append("modelId", String(model.id));
  form.append("modelVersion", String(model.version ?? 1));
  form.append("modelSha256", model.sha256 ?? "");
  form.append("modelDownloadUrl", `${PUBLIC_API_URL}/models/${model.id}/download`);
  form.append("syncToken", COLAB_SYNC_TOKEN);
  form.append("classMap", JSON.stringify(model.classMap ?? {}));
  form.append(
    "labelRoles",
    JSON.stringify(documentType.detectorConfig?.labelRoles ?? {}),
  );
  form.append(
    "groupingRules",
    JSON.stringify(documentType.detectorConfig?.groupingRules ?? {}),
  );
  form.append("fieldConfig", JSON.stringify(documentType.fieldConfig ?? {}));

  const contentLength = await new Promise<number>((resolve, reject) => {
    form.getLength((error, length) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(length);
    });
  });

  return axios.post(COMPARE_URL, form, {
    headers: {
      ...form.getHeaders(),
      "Content-Length": String(contentLength),
      "ngrok-skip-browser-warning": "1",
    },
    params: {
      // The backend already stores artifacts locally, so the compare
      // service does not need to write its own copies to disk.
      save_to_disk: false,
    },
    timeout: COMPARE_TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}

export async function runCompare(opts: {
  file: Express.Multer.File;
  documentTypeKey: string;
  userId: number | null;
  benchmarkId?: number | null;
}): Promise<{ run: ComparisonRun; response: any }> {
  const { file, documentTypeKey, userId, benchmarkId = null } = opts;

  const documentType = await DocumentType.findOne({
    where: { key: documentTypeKey },
  });
  if (!documentType) {
    throw {
      statusCode: 404,
      message: "document type not found",
    };
  }

  if (documentType.status !== "active") {
    throw {
      statusCode: 400,
      message: `document type "${documentTypeKey}" is not active`,
    };
  }

  if (!documentType.detectorModelId) {
    throw {
      statusCode: 400,
      message: "document type has no detector model",
    };
  }

  const model = await Model.findOne({
    where: { id: documentType.detectorModelId },
  });
  if (!model || model.status !== "active") {
    throw {
      statusCode: 400,
      message: "active detector model not available",
    };
  }

  if (!model.sha256 || !model.filePath) {
    throw {
      statusCode: 400,
      message: "detector model file is missing",
    };
  }

  const user = userId ? await User.findOne({ where: { id: userId } }) : null;
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

  let response: any;
  try {
    const compareResponse = await postCompareRequest(
      destinationImagePath,
      file.originalname,
      documentType,
      model,
      file.mimetype,
    );
    response = compareResponse.data;
  } catch (error) {
    try {
      if (shouldRetryCompareRequest(error)) {
        const retryResponse = await postCompareRequest(
          destinationImagePath,
          file.originalname,
          documentType,
          model,
          file.mimetype,
        );
        response = retryResponse.data;
      } else {
        throw error;
      }
    } catch (finalError) {
      await writeJson(artifactPath(run.id, "raw_response"), {
        ok: false,
        compareUrl: COMPARE_URL,
        error: toCompareError(finalError),
      });
      await run.save();
      throw mapCompareServiceError(finalError);
    }
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
  run.documentTypeVersion = documentType.version;
  run.detectorModelId = model.id;
  run.detectorModelVersion = model.version;
  run.promptVersion = documentType.version;
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
    ],
  );

  return { raw, classical, vlm, hybrid, groundTruth, metrics };
}
