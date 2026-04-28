import "reflect-metadata";
import crypto from "crypto";
import { promises as fsp } from "fs";
import path from "path";
import config from "../config";
import { AppDataSource } from "../data-source";
import { DocumentType } from "../entities/DocumentType";
import { Model } from "../entities/Model";

const RECEIPT_SCHEMA = {
  fields: [
    {
      key: "DATE",
      label: "Date",
      type: "date",
      formats: ["DD.MM.YY", "DD.MM.YYYY"],
    },
    { key: "FB", label: "FB", type: "text" },
    { key: "FD", label: "FD", type: "text" },
    { key: "SUM", label: "Sum", type: "money", tolerance: 0.01 },
  ],
  arrays: [
    {
      key: "ORDER",
      label: "Order lines",
      rowKey: "NAME",
      match: "hungarian",
      fields: [
        { key: "NAME", type: "text" },
        { key: "PRICE", type: "money", tolerance: 0.01 },
        { key: "QUANTITY", type: "number" },
      ],
    },
  ],
};

const RECEIPT_PROMPT = `You are given a receipt image.

Extract data and return ONE valid JSON object matching this schema:
{{SCHEMA}}

Return JSON only - no markdown, no comments.`;

const RECEIPT_DETECTOR_CONFIG = {
  classMap: {
    "0": "DATE",
    "1": "FB",
    "2": "FD",
    "3": "SUM",
    "4": "ORDER",
    "5": "NAME",
    "6": "PRICE",
    "7": "QUANTITY",
  },
  labelRoles: {
    DATE: "single",
    FB: "single",
    FD: "single",
    SUM: "single",
    ORDER: "arrayContainer",
    NAME: "arrayChild",
    PRICE: "arrayChild",
    QUANTITY: "arrayChild",
  },
  groupingRules: {
    container: "ORDER",
    row: { matchBy: "NAME" },
  },
} as const;

async function copyReceiptModel(): Promise<{
  filePath: string;
  sha256: string;
  size: number;
}> {
  const sourcePath = path.resolve(
    __dirname,
    "../../../scripts/seed_assets/yolov11_receipt.pt"
  );
  const stat = await fsp.stat(sourcePath).catch(() => null);

  if (!stat) {
    throw new Error(
      `seed asset missing: ${sourcePath}\n` +
        "Download yolov11_text_detector_fixed2vlast.pt from Colab and put it there."
    );
  }

  const destinationPath = path.join(
    config.MODELS_BASE_PATH,
    "receipt",
    "v1",
    "yolov11_receipt.pt"
  );
  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsp.copyFile(sourcePath, destinationPath);

  const buffer = await fsp.readFile(destinationPath);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    filePath: destinationPath,
    sha256,
    size: stat.size,
  };
}

async function main() {
  await AppDataSource.initialize();

  try {
    const documentType =
      (await DocumentType.findOne({ where: { key: "receipt" } })) ??
      new DocumentType();

    Object.assign(documentType, {
      key: "receipt",
      name: "Receipt",
      schema: RECEIPT_SCHEMA,
      promptTemplate: RECEIPT_PROMPT,
      detectorConfig: RECEIPT_DETECTOR_CONFIG,
      fieldConfig: {},
      version: 1,
      status: "draft",
    });
    await documentType.save();

    const { filePath, sha256, size } = await copyReceiptModel();
    const model =
      (await Model.findOne({ where: { name: "receipt-yolov11-v1" } })) ??
      new Model();

    Object.assign(model, {
      name: "receipt-yolov11-v1",
      type: "yolo",
      family: "yolo",
      filePath,
      classesCount: Object.keys(RECEIPT_DETECTOR_CONFIG.classMap).length,
      classMap: RECEIPT_DETECTOR_CONFIG.classMap,
      sha256,
      fileSize: size,
      version: 1,
      documentTypeId: documentType.id,
      status: "validated",
    });
    await model.save();

    documentType.detectorModelId = model.id;
    documentType.status = "active";
    model.status = "active";

    await documentType.save();
    await model.save();

    console.log("Seed complete:", {
      documentTypeId: documentType.id,
      modelId: model.id,
      modelFilePath: filePath,
    });
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
