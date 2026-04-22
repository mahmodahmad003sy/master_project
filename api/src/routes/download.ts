// src/routes/download.ts
import { Router, Request, Response } from "express";
import { ModelFile } from "../entities/ModelFile";
import path from "path";

const router = Router();

/**
 * GET /download/:filename
 *   Finds the ModelFile record by `filename` and sends the file back.
 */
router.get("/:filename", async (req: Request, res: Response) => {
  const requestedName = req.params.filename;

  try {
    const modelFile = await ModelFile.createQueryBuilder("mf")
      .where("mf.filename = :name OR mf.outputName = :name", {
        name: requestedName,
      })
      .getOne();

    if (!modelFile) {
      return res.status(404).json({ message: "File not found" });
    }

    // modelFile.filePath is the absolute path to the original file
    const originalPath = modelFile.filePath;
    const dir = path.dirname(originalPath);
    const base = path.basename(originalPath);

    let downloadPath: string;
    let downloadName: string;

    if (requestedName === base || requestedName === modelFile.filename) {
      // They asked for the original filename
      downloadPath = originalPath;
      downloadName = modelFile.filename;
    } else if (requestedName === modelFile.outputName) {
      // They asked for the outputName file
      downloadPath = path.join(dir, modelFile.outputName);
      downloadName = modelFile.outputName;
    } else {
      // Shouldn't happen, but just in case
      return res.status(400).json({ message: "Invalid file identifier" });
    }

    // Finally stream it down
    return res.download(downloadPath, downloadName);
  } catch (err) {
    console.error("Download error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
