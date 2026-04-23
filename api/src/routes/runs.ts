import multer from "multer";
import { Router } from "express";
import {
  createShareLink,
  deleteGroundTruth,
  deleteRun,
  getArtifact,
  getPublicImage,
  getPublicRun,
  getRun,
  getRunImage,
  listRuns,
  postCompare,
  putGroundTruth,
} from "../controllers/runsController";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
const upload = multer({ dest: "tmp/" });

router.post("/compare", upload.single("file"), asyncHandler(postCompare));
router.get("/runs", asyncHandler(listRuns));
router.get("/runs/:id", asyncHandler(getRun));
router.delete("/runs/:id", asyncHandler(deleteRun));
router.post("/runs/:id/share", asyncHandler(createShareLink));
router.put("/runs/:id/ground-truth", asyncHandler(putGroundTruth));
router.delete("/runs/:id/ground-truth", asyncHandler(deleteGroundTruth));
router.get("/runs/:id/image", asyncHandler(getRunImage));
router.get("/runs/:id/artifacts/:name", asyncHandler(getArtifact));

export { getPublicRun, getPublicImage };

export default router;
