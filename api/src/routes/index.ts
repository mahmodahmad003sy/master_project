import express, { Router, Request, Response, NextFunction } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import multer from "multer";
import { swaggerOptions } from "../swagger/swaggerConfig";

import modelsRouter from "./models";
import ModelFileRouter from "./files";
import testsRouter from "./tests";
import detectRouter from "./detect";
import downloadRouter from "./download";
import { requireAuth } from "../utils/authMiddleware";
import path from "path";
import authRouter from "./auth";
const router = Router();
const swaggerSpec = swaggerJsdoc(swaggerOptions);
router.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

router.use("/auth", authRouter);

router.use("/download", downloadRouter);
router.use("/detect", requireAuth, detectRouter);
router.use("/models", requireAuth, modelsRouter);
router.use("/model-files", requireAuth, ModelFileRouter);
/* router.use(
  "/datasets/:datasetId/files",
  (req: Request, res: Response, next: NextFunction) =>
    upload.single("file")(req, res, next),
  ModelFileRouter
); */

// mount sub‑routers

router.use("/test-runs", testsRouter);
router.use((_req: Request, res: Response, _next: NextFunction) => {
  const status = 500;
  res.status(status).json({ error: "Not found" });
});
export default router;
