import { Router } from "express";
import {
  createDocumentType,
  getDocumentType,
  listDocumentTypes,
  updateDocumentType,
} from "../controllers/documentTypeController";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(listDocumentTypes));
router.get("/:id", asyncHandler(getDocumentType));
router.post("/", asyncHandler(createDocumentType));
router.put("/:id", asyncHandler(updateDocumentType));

export default router;
