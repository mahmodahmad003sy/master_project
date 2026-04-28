import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  getRuntimeSettings,
  putRuntimeSettings,
} from "../controllers/runtimeSettingsController";

const router = Router();

router.get("/runtime", asyncHandler(getRuntimeSettings));
router.put("/runtime", asyncHandler(putRuntimeSettings));

export default router;
