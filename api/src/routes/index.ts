import { NextFunction, Request, Response, Router } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { swaggerOptions } from "../swagger/swaggerConfig";
import analyticsRouter from "./analytics";
import authRouter from "./auth";
import benchmarksRouter from "./benchmarks";
import documentTypesRouter from "./documentTypes";
import downloadRouter from "./download";
import modelsRouter from "./models";
import runsRouter, { getPublicImage, getPublicRun } from "./runs";
import settingsRouter from "./settings";
import { requireAuth } from "../utils/authMiddleware";
import { asyncHandler } from "../utils/asyncHandler";
import { requireSyncToken } from "../utils/syncTokenMiddleware";
import {
  downloadModelFile,
  listActiveModels,
} from "../controllers/modelController";

const router = Router();
const swaggerSpec = swaggerJsdoc(swaggerOptions);

router.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
router.use("/auth", authRouter);
router.use("/download", downloadRouter);
router.get("/public/runs/:id", asyncHandler(getPublicRun));
router.get("/public/runs/:id/image", asyncHandler(getPublicImage));
router.get("/models/active", requireSyncToken, asyncHandler(listActiveModels));
router.get(
  "/models/:modelId/download",
  requireSyncToken,
  asyncHandler(downloadModelFile)
);
router.use("/models", requireAuth, modelsRouter);
router.use("/document-types", requireAuth, documentTypesRouter);
router.use("/settings", requireAuth, settingsRouter);
router.use("/analytics", requireAuth, analyticsRouter);
router.use("/benchmarks", requireAuth, benchmarksRouter);
router.use(requireAuth, runsRouter);
router.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ error: "Not found" });
});

export default router;
