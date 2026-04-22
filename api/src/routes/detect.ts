import { Router, Request, Response } from "express";
import multer from "multer";
import { asyncHandler } from "../utils/asyncHandler";
import { detectFile } from "../controllers/detectController";
import { Model } from "../entities/Model";
import { AuthRequest } from "../utils/authMiddleware";
import { error, log } from "console";

const router = Router();
const upload = multer({ dest: "tmp/" });

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const idsParam = req.query.ids as string;
    if (!req.file) throw { statusCode: 400, message: "No file uploaded" };
    if (!idsParam) throw { statusCode: 400, message: "No model IDs provided" };

    const modelIds = idsParam.split(",").map((id) => parseInt(id.trim(), 10));

    const results = [];

    for (const modelId of modelIds) {
      const model = await Model.findOne({ where: { id: modelId } });
      if (!model) {
        results.push({
          modelId,
          error: `Model with ID ${modelId} not found`,
        });
        continue;
      }

      try {
        if (!req.userId) throw error({ message: "User Not found" });
        const data = await detectFile({ ...req.file }, model, req.userId); // clone file object
        results.push({ modelId, ...data });
      } catch (err: any) {
        console.log({ err });

        results.push({
          modelId,
          error: err?.message || "Detection failed",
        });
      }
    }

    res.json({ results });
  })
);
export default router;
