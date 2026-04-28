import { Request, Response } from "express";
import { DocumentType } from "../entities/DocumentType";
import { Model } from "../entities/Model";
import { ComparisonRun } from "../entities/ComparisonRun";
import {
  shouldBumpVersion,
  validateDetectorConfigAgainstSchema,
} from "../services/documentTypeValidation";

export const listDocumentTypes = async (_req: Request, res: Response) => {
  const items = await DocumentType.find({ order: { id: "ASC" } });
  res.json(items);
};

export const getDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = await DocumentType.findOne({ where: { id } });

  if (!item) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(item);
};

export const createDocumentType = async (req: Request, res: Response) => {
  const {
    key,
    name,
    schema,
    fieldConfig,
    detectorConfig,
    promptTemplate,
    modelId,
  } = req.body;

  if (!key || !name || !schema) {
    return res.status(400).json({ error: "key, name, schema are required" });
  }

  const existing = await DocumentType.findOne({ where: { key } });
  if (existing) {
    return res.status(409).json({ error: "key already exists" });
  }

  const item = DocumentType.create({
    key,
    name,
    schema,
    fieldConfig,
    detectorConfig,
    promptTemplate,
    status: "draft",
    version: 1,
  });
  await item.save();

  if (modelId != null) {
    await attachDetectorInternal(item, Number(modelId));
  }

  const refreshed = await DocumentType.findOne({ where: { id: item.id } });
  res.status(201).json(refreshed ?? item);
};

export const updateDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = await DocumentType.findOne({ where: { id } });

  if (!item) {
    return res.status(404).json({ error: "Not found" });
  }

  const before = {
    schema: item.schema,
    detectorConfig: item.detectorConfig,
    promptTemplate: item.promptTemplate,
  };

  if (
    req.body.key &&
    req.body.key !== item.key &&
    (await DocumentType.findOne({ where: { key: req.body.key } }))
  ) {
    return res.status(409).json({ error: "key already exists" });
  }

  const nextDetectorModelId =
    "detectorModelId" in req.body ? req.body.detectorModelId : undefined;

  Object.assign(item, {
    ...req.body,
    detectorModelId:
      nextDetectorModelId === undefined ? item.detectorModelId : item.detectorModelId,
  });

  if (nextDetectorModelId === null) {
    item.detectorModelId = null as any;
  }

  if (shouldBumpVersion(before, req.body)) {
    item.version = (item.version ?? 1) + 1;
  }

  await item.save();

  if (
    nextDetectorModelId != null &&
    Number(nextDetectorModelId) !== Number(item.detectorModelId)
  ) {
    await attachDetectorInternal(item, Number(nextDetectorModelId));
  }

  res.json(item);
};

export const activateDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = await DocumentType.findOne({ where: { id } });

  if (!item) {
    throw { statusCode: 404, message: "document type not found" };
  }

  if (!item.schema) {
    throw { statusCode: 400, message: "schema is required" };
  }

  if (!item.promptTemplate) {
    throw { statusCode: 400, message: "promptTemplate is required" };
  }

  validateDetectorConfigAgainstSchema(item);

  if (!item.detectorModelId) {
    throw { statusCode: 400, message: "no detector model attached" };
  }

  const model = await Model.findOne({ where: { id: item.detectorModelId } });
  if (!model || !["validated", "active"].includes(model.status)) {
    throw {
      statusCode: 400,
      message: "attached detector model must be in 'validated' or 'active' status",
    };
  }

  const otherModels = await Model.find({
    where: { documentTypeId: item.id },
  });
  await Promise.all(
    otherModels
      .filter((other) => other.id !== model.id && other.status === "active")
      .map(async (other) => {
        other.status = "validated";
        await other.save();
      })
  );

  item.status = "active";
  await item.save();

  model.status = "active";
  await model.save();

  res.json(item);
};

export const attachDetector = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { modelId } = req.body;
  const item = await DocumentType.findOne({ where: { id } });

  if (!item) {
    throw { statusCode: 404, message: "document type not found" };
  }

  if (modelId == null) {
    throw { statusCode: 400, message: "modelId is required" };
  }

  await attachDetectorInternal(item, Number(modelId));
  res.json(item);
};

export const listModelsForDocumentType = async (
  req: Request,
  res: Response
) => {
  const id = Number(req.params.id);
  const models = await Model.find({
    where: { documentTypeId: id },
    order: { id: "ASC" },
  });
  res.json(models);
};

export const deleteDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = await DocumentType.findOne({ where: { id } });

  if (!item) {
    throw { statusCode: 404, message: "document type not found" };
  }

  if (item.status === "active") {
    throw {
      statusCode: 409,
      message: "cannot delete an active document type; archive it first",
    };
  }

  const [attachedModelsCount, runsCount] = await Promise.all([
    Model.count({ where: { documentTypeId: item.id } }),
    ComparisonRun.count({ where: { documentType: item.key } }),
  ]);

  if (attachedModelsCount > 0) {
    throw {
      statusCode: 409,
      message: "cannot delete a document type that still has attached models",
    };
  }

  if (runsCount > 0) {
    throw {
      statusCode: 409,
      message: "cannot delete a document type that already has comparison runs",
    };
  }

  await item.remove();
  res.status(204).send();
};

async function attachDetectorInternal(
  documentType: DocumentType,
  modelId: number
): Promise<void> {
  const model = await Model.findOne({ where: { id: modelId } });
  if (!model) {
    throw { statusCode: 404, message: "model not found" };
  }

  if (model.documentTypeId != null && model.documentTypeId !== documentType.id) {
    throw {
      statusCode: 409,
      message: "model is already attached to another document type",
    };
  }

  model.documentTypeId = documentType.id;
  await model.save();

  documentType.detectorModelId = model.id;
  await documentType.save();
}
