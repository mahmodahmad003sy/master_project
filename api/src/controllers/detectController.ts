// src/controllers/detectController.ts
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import config from "./../../config/default.json";
import { Model } from "../entities/Model";
import { ModelFile } from "../entities/ModelFile";
import { TestRun } from "../entities/TestRun";
import { User } from "../entities/User";

const DETECT_URL = config.DETECTION_SERVICE_URL!;

export const detectFile = async (
  file: Express.Multer.File,
  model: Model,
  userId: number
): Promise<any> => {
  // 1) copy temp
  const tempFilePath = `${file.path}_${model.id}`;
  await fs.promises.copyFile(file.path, tempFilePath);

  // 2) build form
  const form = new FormData();
  form.append("file", fs.createReadStream(tempFilePath), file.originalname);
  form.append("model_type", model.type);
  form.append("model_path", model.filePath!);

  // ← pass your JSON fields
  form.append("display_config", JSON.stringify(model.displayConfig || {}));
  form.append("coco_classes", JSON.stringify(model.cocoClasses || {}));
  // join languages array into tesseract 'lang1+lang2' syntax
  const langStr =
    Array.isArray(model.languages) && model.languages.length
      ? model.languages.join("+")
      : "";
  form.append("ocr_lang", langStr);

  // 3) call FastAPI
  const resp = await axios.post(`${DETECT_URL}/detect`, form, {
    headers: form.getHeaders(),
    timeout: 120_000,
  });
  const data = resp.data;

  // 4) write out results & image
  const modelDir = path.dirname(model.filePath!);
  const infDir = path.join(modelDir, "inference", `${Date.now()}`);
  await fs.promises.mkdir(infDir, { recursive: true });

  const inputDest = path.join(infDir, file.originalname);
  await fs.promises.rename(tempFilePath, inputDest);

  const jsonPath = path.join(infDir, "results.json");
  await fs.promises.writeFile(jsonPath, JSON.stringify(data, null, 2), "utf-8");

  let outImagePath: string | null = null;
  if (data.image_url) {
    const imgUrl = data.image_url.startsWith("http")
      ? data.image_url
      : `${DETECT_URL}${data.image_url}`;
    const imgResp = await axios.get(imgUrl, { responseType: "arraybuffer" });
    const imgName = path.basename(data.image_url);
    outImagePath = path.join(infDir, imgName);
    await fs.promises.writeFile(outImagePath, imgResp.data);
  }

  // 5) persist TestRun & ModelFile
  const user = await User.findOneOrFail({ where: { id: userId } });
  const imgName = data.image_url ? path.basename(data.image_url) : "";

  const mf = ModelFile.create({
    filename: file.originalname,
    filePath: inputDest,
    model,
    user,
    outputName: imgName,
  });
  await mf.save();

  const tr = TestRun.create({
    modelFile: mf,
    resultsPath: infDir,
    metrics: data.results ?? data,
  });
  await tr.save();

  return data;
};
