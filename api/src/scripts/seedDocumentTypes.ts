import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { DocumentType } from "../entities/DocumentType";

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

async function main() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(DocumentType);
  const existing = await repo.findOne({ key: "receipt" });

  if (existing) {
    existing.name = "Receipt";
    existing.schema = RECEIPT_SCHEMA;
    await repo.save(existing);
    console.log("Receipt document type updated.");
  } else {
    const item = repo.create({
      key: "receipt",
      name: "Receipt",
      schema: RECEIPT_SCHEMA,
    });
    await repo.save(item);
    console.log("Receipt document type created.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
