import multer from "multer";
import { Router } from "express";
import {
  deleteRun,
  getArtifact,
  getRun,
  getRunImage,
  listRuns,
  postCompare,
} from "../controllers/runsController";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
const upload = multer({ dest: "tmp/" });

router.post("/compare", upload.single("file"), asyncHandler(postCompare));
router.get("/runs", asyncHandler(listRuns));
router.get("/runs/:id", asyncHandler(getRun));
router.delete("/runs/:id", asyncHandler(deleteRun));
router.get("/runs/:id/image", asyncHandler(getRunImage));
router.get("/runs/:id/artifacts/:name", asyncHandler(getArtifact));

export default router;
