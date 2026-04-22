// src/controllers/testController.ts
import path from "path";
import { spawn } from "child_process";
import { ModelFile } from "../entities/ModelFile";
import { TestRun } from "../entities/TestRun";

export const runTest = async (modelFileId: number) => {
  const mf = await ModelFile.findOne({
    where: { id: modelFileId },
    relations: ["dataset", "dataset.model"],
  });
  if (!mf) throw { statusCode: 404, message: "ModelFile not found" };
};
