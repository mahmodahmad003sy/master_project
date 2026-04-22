import { Request, Response, Router } from "express";
import path from "path";
import { Model } from "../entities/Model";

const router = Router();

router.get("/:filename", async (req: Request, res: Response) => {
  const requestedName = req.params.filename;

  try {
    const models = await Model.find();
    const model = models.find((item) => {
      if (!item.filePath) {
        return false;
      }

      return path.basename(item.filePath) === requestedName;
    });

    if (!model?.filePath) {
      return res.status(404).json({ error: "File not found" });
    }

    return res.download(model.filePath, path.basename(model.filePath));
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
