import crypto from "crypto";
import { Request, Response } from "express";
import fs, { promises as fsp } from "fs";
import path from "path";
import { Model } from "../entities/Model";
import { DocumentType } from "../entities/DocumentType";
import config from "../config";
import { collectCanonicalLabels } from "../services/documentTypeValidation";
import { getRuntimeSettingValue } from "../services/runtimeSettings";

export interface CreateModelParams {
  name: string;
  type: string;
  family?: string;
  classesCount?: number;
  classMap?: Record<string, string>;
  inputImageSize?: number;
  confidenceDefaults?: { default: number; perClass?: Record<string, number> };
  documentTypeId?: number;
  status?: "uploaded" | "validated" | "active" | "archived";
  version?: number;
  notes?: string;
  // Optional JSON-backed settings:
  cocoClasses?: Record<number, string>;
  displayConfig?: Record<
    number,
    { multiple: boolean; threshold: number | null }
  >;
  languages?: string[];
}

const pathExists = async (targetPath: string): Promise<boolean> =>
  fsp
    .access(targetPath)
    .then(() => true)
    .catch(() => false);

const computeSha256 = async (filePath: string): Promise<string> => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  return hash.digest("hex");
};

export const createModel = async (
  params: CreateModelParams,
): Promise<Model> => {
  const {
    name,
    type,
    family,
    classesCount,
    classMap,
    inputImageSize,
    confidenceDefaults,
    documentTypeId,
    status,
    version,
    notes,
    cocoClasses,
    displayConfig,
    languages,
  } = params;
  const basePath = config.MODELS_BASE_PATH;
  if (!basePath) {
    throw {
      statusCode: 500,
      message: "Environment variable MODELS_BASE_PATH is not defined",
    };
  }

  // Build the folder path
  const modelDir = path.join(basePath, name);

  // Prevent duplicates
  const existedModel = await Model.findOne({ where: { name, type } });
  if (existedModel) {
    throw { statusCode: 400, message: "Model already exists" };
  }

  // Create the folder (and parents) if it doesn't exist
  await fs.promises.mkdir(modelDir, { recursive: true });

  // Create & save the Model record with optional JSON fields
  const model = Model.create({
    name,
    type,
    family: family ?? "yolo",
    classesCount,
    classMap,
    inputImageSize,
    confidenceDefaults,
    documentTypeId,
    status: status ?? "uploaded",
    version: version ?? 1,
    notes,
    cocoClasses,
    displayConfig,
    languages,
  });
  return model.save();
};

export const listModels = async (): Promise<Model[]> => {
  return Model.find();
};

export const uploadModelFile = async (
  modelId: number,
  file: Express.Multer.File,
): Promise<Model> => {
  const model = await Model.findOne({ where: { id: modelId } });
  if (!model) throw { statusCode: 404, message: "Model not found" };

  if (!file.originalname.toLowerCase().endsWith(".pt")) {
    await fsp.unlink(file.path).catch(() => undefined);
    throw {
      statusCode: 400,
      message: "only .pt files are accepted as detector weights",
    };
  }

  const basePath = config.MODELS_BASE_PATH!;
  const modelDir = path.resolve(basePath, model.name);
  await fs.promises.mkdir(modelDir, { recursive: true });

  // pick a unique subfolder per upload
  const originalName = file.originalname;
  const fileBase = path.parse(originalName).name;
  let fileFolder = path.join(modelDir, fileBase);
  let counter = 1;
  while (
    await fs.promises
      .access(fileFolder)
      .then(() => true)
      .catch(() => false)
  ) {
    fileFolder = path.join(modelDir, `${fileBase}__${counter++}`);
  }
  await fs.promises.mkdir(fileFolder, { recursive: true });

  // move weights into it
  const dest = path.join(fileFolder, originalName);
  await fsp.rename(file.path, dest);

  // persist on the model
  model.filePath = dest;
  const stat = await fsp.stat(dest);
  model.sha256 = await computeSha256(dest);
  model.fileSize = stat.size;
  return model.save();
};

export const uploadDatasetFile = async (
  modelId: number,
  file: Express.Multer.File,
): Promise<{ datasetPath: string }> => {
  // 1. Ensure model exists
  const model = await Model.findOne({ where: { id: modelId } });
  if (!model) throw { statusCode: 404, message: "Model not found" };

  // 2. Validate .rar extension
  const originalName = file.originalname;
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== ".rar") {
    // clean up the temp upload
    await fs.promises.unlink(file.path).catch(() => {});
    throw { statusCode: 400, message: "Only .rar archives are allowed" };
  }

  // 3. Compute paths
  const basePath = config.MODELS_BASE_PATH;
  if (!basePath)
    throw { statusCode: 500, message: "MODELS_BASE_PATH is not set" };

  const modelDir = path.resolve(basePath, model.name);
  const datasetDir = path.join(modelDir, "dataset");
  await fs.promises.mkdir(datasetDir, { recursive: true });

  const dest = path.join(datasetDir, "dataset.rar");

  // 4. Move file into place
  await fs.promises.rename(file.path, dest);

  // 5. Return the disk path
  return { datasetPath: dest };
};

export const validateModel = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const id = Number(req.params.modelId);
  const model = await Model.findOne({ where: { id } });
  if (!model) throw { statusCode: 404, message: "model not found" };

  if (!model.filePath || !(await pathExists(model.filePath))) {
    throw { statusCode: 400, message: "model file is missing on disk" };
  }

  const cm = model.classMap ?? {};
  if (
    model.classesCount != null &&
    Object.keys(cm).length !== Number(model.classesCount)
  ) {
    throw {
      statusCode: 400,
      message: `classMap size (${Object.keys(cm).length}) does not match classesCount (${model.classesCount})`,
    };
  }

  if (model.documentTypeId != null) {
    const docType = await DocumentType.findOne({
      where: { id: Number(model.documentTypeId) },
    });
    if (!docType) {
      throw {
        statusCode: 400,
        message: "model references a document type that does not exist",
      };
    }

    const allowed = collectCanonicalLabels(docType);
    const unknown = Object.values(cm).filter((label) => !allowed.has(label));
    if (unknown.length > 0) {
      throw {
        statusCode: 400,
        message: `classMap references labels not present in document type schema: ${unknown.join(", ")}`,
      };
    }
  }

  model.status = "validated";
  await model.save();
  res.json(model);
};

export const deleteModel = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const id = Number(req.params.modelId);
  const model = await Model.findOne({ where: { id } });
  if (!model) throw { statusCode: 404, message: "model not found" };

  if (model.status === "active") {
    throw {
      statusCode: 409,
      message: "cannot delete an active detector model; archive it first",
    };
  }

  const documentType =
    model.documentTypeId == null
      ? null
      : await DocumentType.findOne({ where: { id: Number(model.documentTypeId) } });

  if (documentType?.status === "active" && documentType.detectorModelId === model.id) {
    throw {
      statusCode: 409,
      message: "cannot delete the detector model attached to an active document type",
    };
  }

  if (documentType?.detectorModelId === model.id) {
    documentType.detectorModelId = null as any;
    await documentType.save();
  }

  if (model.filePath) {
    await fsp.unlink(model.filePath).catch(() => undefined);
  }

  await model.remove();
  res.status(204).send();
};

export const listActiveModels = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const models = await Model.find({ where: { status: "active" } });
  const publicBase = String(
    await getRuntimeSettingValue("PUBLIC_API_URL"),
  ).replace(/\/$/, "");

  if (!publicBase) {
    throw { statusCode: 500, message: "PUBLIC_API_URL is not configured" };
  }

  const rows = await Promise.all(
    models.map(async (model) => {
      if (model.documentTypeId == null || !model.sha256 || !model.filePath) {
        return null;
      }

      const docType = await DocumentType.findOne({
        where: { id: Number(model.documentTypeId) },
      });
      if (!docType) return null;

      return {
        modelId: model.id,
        modelVersion: model.version,
        documentTypeKey: docType.key,
        documentTypeVersion: (docType as any)?.version ?? 1,
        sha256: model.sha256,
        fileSize: model.fileSize == null ? null : Number(model.fileSize),
        downloadUrl: `${publicBase}/models/${model.id}/download`,
        classMap: model.classMap ?? {},
      };
    }),
  );

  res.json(rows.filter(Boolean));
};

export const downloadModelFile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  console.log("====================================");
  console.log("start downloding");
  console.log("====================================");
  const id = Number(req.params.modelId);
  const model = await Model.findOne({ where: { id } });
  if (!model?.filePath || !(await pathExists(model.filePath))) {
    throw { statusCode: 404, message: "model file not found" };
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("ETag", `"${model.sha256 ?? ""}"`);
  res.setHeader("X-Model-Version", String(model.version));
  if (model.fileSize != null) {
    res.setHeader("Content-Length", String(model.fileSize));
  }
  console.log("====================================");
  console.log({ path: model.filePath });
  console.log("====================================");
  res.sendFile(path.resolve(model.filePath));
};
