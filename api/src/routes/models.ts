// src/routes/modelRoutes.ts

import { Router, Request, Response, NextFunction } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  createModel,
  deleteModel,
  listModels,
  uploadDatasetFile,
  uploadModelFile,
  validateModel,
} from "../controllers/modelController";
import multer from "multer";
import { Model } from "../entities/Model";

const router = Router();
const upload = multer({ dest: "tmp/" });

router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
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
      cocoClasses, // expect JSON object, e.g. { "0": "DATE", ... }
      displayConfig, // expect JSON object, e.g. { "0": { multiple: false, threshold: 0 }, ... }
      languages, // expect array of strings, e.g. ["rus", "eng"]
    } = req.body;

    const model = await createModel({
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
    });
    res.status(201).json(model);
  }),
);

router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const models = await listModels();
    res.json(models);
  }),
);

router.post(
  "/:modelId/file",
  (req, _res, next) => upload.single("file")(req, _res, next),
  asyncHandler(async (req: Request, res: Response) => {
    const modelId = parseInt(req.params.modelId, 10);
    if (!req.file) throw { statusCode: 400, message: "No file uploaded" };
    const updated = await uploadModelFile(modelId, req.file);
    res.json(updated);
  }),
);

router.post(
  "/:modelId/dataset",
  (req, _res, next: NextFunction) => upload.single("file")(req, _res, next),
  asyncHandler(async (req: Request, res: Response) => {
    const modelId = parseInt(req.params.modelId, 10);
    if (!req.file) throw { statusCode: 400, message: "No file uploaded" };
    const result = await uploadDatasetFile(modelId, req.file);
    res.json(result);
  }),
);

router.post("/:modelId/validate", asyncHandler(validateModel));

router.put(
  "/:modelId",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.modelId, 10);
    const model = await Model.findOne({ where: { id } });
    if (!model) return res.status(404).send();

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
      cocoClasses, // optional JSON object to overwrite
      displayConfig, // optional JSON object to overwrite
      languages, // optional array of strings
    } = req.body;

    if (name !== undefined) model.name = name;
    if (type !== undefined) model.type = type;
    if (family !== undefined) model.family = family;
    if (classesCount !== undefined) model.classesCount = classesCount;
    if (classMap !== undefined) model.classMap = classMap;
    if (inputImageSize !== undefined) model.inputImageSize = inputImageSize;
    if (confidenceDefaults !== undefined) {
      model.confidenceDefaults = confidenceDefaults;
    }
    if (documentTypeId !== undefined) model.documentTypeId = documentTypeId;
    if (status !== undefined) model.status = status;
    if (version !== undefined) model.version = version;
    if (notes !== undefined) model.notes = notes;

    if (cocoClasses !== undefined) {
      model.cocoClasses = cocoClasses;
    }
    if (displayConfig !== undefined) {
      model.displayConfig = displayConfig;
    }
    if (languages !== undefined) {
      model.languages = Array.isArray(languages)
        ? languages
        : typeof languages === "string"
          ? languages.split(",").map((l) => l.trim())
          : model.languages;
    }

    await model.save();
    res.json(model);
  }),
);

router.delete(
  "/:modelId",
  asyncHandler(deleteModel),
);

export default router;
