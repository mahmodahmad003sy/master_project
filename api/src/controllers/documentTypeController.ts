import { Request, Response } from "express";
import { DocumentType } from "../entities/DocumentType";

export const listDocumentTypes = async (_req: Request, res: Response) => {
  const items = await DocumentType.find({ order: { id: "ASC" } });
  res.json(items);
};

export const getDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = await DocumentType.findOneBy({ id });

  if (!item) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(item);
};

export const createDocumentType = async (req: Request, res: Response) => {
  const { key, name, schema } = req.body;

  if (!key || !name || !schema) {
    return res.status(400).json({ error: "key, name, schema are required" });
  }

  const existing = await DocumentType.findOneBy({ key });
  if (existing) {
    return res.status(409).json({ error: "key already exists" });
  }

  const item = DocumentType.create({ key, name, schema });
  await item.save();
  res.status(201).json(item);
};

export const updateDocumentType = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = await DocumentType.findOneBy({ id });

  if (!item) {
    return res.status(404).json({ error: "Not found" });
  }

  const { name, schema } = req.body;
  if (name !== undefined) {
    item.name = name;
  }
  if (schema !== undefined) {
    item.schema = schema;
  }

  await item.save();
  res.json(item);
};
