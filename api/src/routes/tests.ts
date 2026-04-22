import { Router, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { runTest } from "../controllers/testController";

const router = Router();

router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const { modelFileId } = req.body;
    const result = await runTest(modelFileId);
    res.json(result);
  })
);

export default router;
