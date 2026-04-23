import { Router } from "express";
import { analyticsSummary } from "../controllers/analyticsController";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/summary", asyncHandler(analyticsSummary));

export default router;
