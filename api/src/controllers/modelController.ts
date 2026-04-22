// src/controllers/modelController.ts

import { Model } from "../entities/Model";
import fs from "fs";
import path from "path";
import config from "./../../config/default.json";

export interface CreateModelParams {
  name: string;
  type: string;
  // Optional JSON-backed settings:
  cocoClasses?: Record<number, string>;
  displayConfig?: Record<
    number,
    { multiple: boolean; threshold: number | null }
  >;
  languages?: string[];
}

export const createModel = async (
  params: CreateModelParams
): Promise<Model> => {
  const { name, type, cocoClasses, displayConfig, languages } = params;
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
  file: Express.Multer.File
): Promise<Model> => {
  const model = await Model.findOne({ where: { id: modelId } });
  if (!model) throw { statusCode: 404, message: "Model not found" };

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
  await fs.promises.rename(file.path, dest);

  // persist on the model
  model.filePath = dest;
  return model.save();
};

export const uploadDatasetFile = async (
  modelId: number,
  file: Express.Multer.File
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
