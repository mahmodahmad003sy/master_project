import { DocumentType } from "../entities/DocumentType";
import {
  collectCanonicalLabels,
  shouldBumpVersion,
  validateDetectorConfigAgainstSchema,
} from "../services/documentTypeValidation";

function makeDocumentType(overrides: Partial<DocumentType> = {}): DocumentType {
  return {
    id: 1,
    key: "doc",
    name: "Doc",
    schema: { fields: [], arrays: [] },
    status: "draft",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DocumentType;
}

describe("collectCanonicalLabels", () => {
  test("collects labels from receipt-like schema", () => {
    const documentType = makeDocumentType({
      schema: {
        fields: [{ key: "DATE" }, { key: "SUM" }],
        arrays: [
          {
            key: "ORDER",
            fields: [{ key: "NAME" }, { key: "PRICE" }],
          },
        ],
      },
    });

    expect(collectCanonicalLabels(documentType)).toEqual(
      new Set(["DATE", "SUM", "ORDER", "NAME", "PRICE"])
    );
  });

  test("collects labels from non-receipt schema", () => {
    const documentType = makeDocumentType({
      schema: {
        fields: [{ key: "INVOICE_NO" }, { key: "AMOUNT" }],
        arrays: [
          {
            key: "ITEMS",
            fields: [{ key: "DESCRIPTION" }, { key: "QTY" }],
          },
        ],
      },
    });

    expect(collectCanonicalLabels(documentType)).toEqual(
      new Set(["INVOICE_NO", "AMOUNT", "ITEMS", "DESCRIPTION", "QTY"])
    );
  });
});

describe("validateDetectorConfigAgainstSchema", () => {
  test("accepts valid detector config", () => {
    const documentType = makeDocumentType({
      schema: {
        fields: [{ key: "DATE" }, { key: "SUM" }],
        arrays: [{ key: "ORDER", fields: [{ key: "NAME" }] }],
      },
      detectorConfig: {
        classMap: { "0": "DATE", "1": "SUM", "2": "NAME" },
        labelRoles: {
          DATE: "single",
          SUM: "single",
          ORDER: "arrayContainer",
          NAME: "arrayChild",
        },
        groupingRules: { container: "ORDER" },
      },
    });

    expect(() => validateDetectorConfigAgainstSchema(documentType)).not.toThrow();
  });

  test("rejects unknown classMap labels", () => {
    const documentType = makeDocumentType({
      schema: {
        fields: [{ key: "DATE" }],
        arrays: [],
      },
      detectorConfig: {
        classMap: { "0": "MISSING" },
        labelRoles: {},
      },
    });

    expect(() => validateDetectorConfigAgainstSchema(documentType)).toThrow(
      /classMap label "MISSING" is not present in schema/
    );
  });

  test("rejects unknown labelRoles labels", () => {
    const documentType = makeDocumentType({
      schema: {
        fields: [{ key: "DATE" }],
        arrays: [],
      },
      detectorConfig: {
        classMap: { "0": "DATE" },
        labelRoles: { MISSING: "single" },
      } as any,
    });

    expect(() => validateDetectorConfigAgainstSchema(documentType)).toThrow(
      /labelRoles label "MISSING" is not present in schema/
    );
  });
});

describe("shouldBumpVersion", () => {
  const before = {
    schema: { fields: [{ key: "DATE" }], arrays: [] },
    detectorConfig: { classMap: { "0": "DATE" }, labelRoles: { DATE: "single" } },
    promptTemplate: "prompt-v1",
  } as any;

  test("returns true when schema changes", () => {
    expect(
      shouldBumpVersion(before, {
        schema: { fields: [{ key: "SUM" }], arrays: [] } as any,
      })
    ).toBe(true);
  });

  test("returns true when detector config changes", () => {
    expect(
      shouldBumpVersion(before, {
        detectorConfig: {
          classMap: { "0": "SUM" },
          labelRoles: { SUM: "single" },
        } as any,
      })
    ).toBe(true);
  });

  test("returns true when prompt template changes", () => {
    expect(
      shouldBumpVersion(before, {
        promptTemplate: "prompt-v2",
      })
    ).toBe(true);
  });

  test("returns false when unrelated fields change", () => {
    expect(
      shouldBumpVersion(before, {
        name: "Renamed document type",
      } as any)
    ).toBe(false);
  });
});
