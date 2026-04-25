import { Router } from "express";
import {
  activateDocumentType,
  attachDetector,
  createDocumentType,
  getDocumentType,
  listModelsForDocumentType,
  listDocumentTypes,
  updateDocumentType,
} from "../controllers/documentTypeController";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(listDocumentTypes));
router.get("/:id", asyncHandler(getDocumentType));
router.get("/:id/models", asyncHandler(listModelsForDocumentType));
router.post("/", asyncHandler(createDocumentType));
router.put("/:id", asyncHandler(updateDocumentType));
router.post("/:id/activate", asyncHandler(activateDocumentType));
router.post("/:id/detector-model", asyncHandler(attachDetector));

export default router;
