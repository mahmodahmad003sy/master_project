// src/routes/modelFileRoutes.ts
import { Router, Request, Response } from "express";
import {
  getModelFiles,
  getModelFileById,
  ListParams,
} from "../controllers/fileController";

const modelFileRouter = Router();

modelFileRouter.get("/", async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, string>;
    const params: ListParams = {
      search: query.search,
      modelId: query.modelId && Number(query.modelId),
      userId: query.userId && Number(query.userId),
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    };

    const [items, total] = await getModelFiles(params);
    res.json({ total, items });
  } catch (err) {
    res.status(500).json({ message: "Error fetching model files" });
  }
});

modelFileRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const item = await getModelFileById(id);
    res.json(item);
  } catch (err: any) {
    if (err.message === "NOT_FOUND") {
      res.status(404).json({ message: "ModelFile not found" });
    } else {
      res.status(500).json({ message: "Error fetching model file" });
    }
  }
});

export default modelFileRouter;
