import multer from "multer";
import { Router } from "express";
import {
  createBenchmark,
  deleteBenchmark,
  exportBenchmarkCsv,
  getBenchmark,
  listBenchmarks,
  runBenchmark,
  uploadBenchmarkItems,
} from "../controllers/benchmarkController";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
const upload = multer({ dest: "tmp/" });

router.get("/", asyncHandler(listBenchmarks));
router.post("/", asyncHandler(createBenchmark));
router.get("/:id", asyncHandler(getBenchmark));
router.delete("/:id", asyncHandler(deleteBenchmark));
router.post("/:id/items", upload.single("zip"), asyncHandler(uploadBenchmarkItems));
router.post("/:id/run", asyncHandler(runBenchmark));
router.get("/:id/export/csv", asyncHandler(exportBenchmarkCsv));

export default router;
