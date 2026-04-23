import {
  cer,
  fieldMatch,
  normalizeDate,
  normalizeNumber,
  normalizeText,
  orderMatch,
  scoreRun,
} from "../services/metrics";

describe("normalizers", () => {
  test("normalizes text", () => {
    expect(normalizeText("  Hello WORLD  ")).toBe("hello world");
  });

  test("normalizes numbers with mixed separators", () => {
    expect(normalizeNumber("1,234.50EUR")).toBe(1234.5);
  });

  test("normalizes dd.mm.yy dates", () => {
    expect(normalizeDate("27.12.25")).toBe("2025-12-27");
  });

  test("normalizes dd.mm.yyyy dates", () => {
    expect(normalizeDate("27.12.2025")).toBe("2025-12-27");
  });

  test("rejects invalid dates", () => {
    expect(normalizeDate("77.12.18")).toBeNull();
  });
});

describe("cer", () => {
  test("is zero for identical strings", () => {
    expect(cer("abc", "abc")).toBe(0);
  });

  test("handles one edit", () => {
    expect(cer("abc", "abd")).toBeCloseTo(1 / 3, 5);
  });
});

describe("fieldMatch", () => {
  test("matches money exactly", () => {
    const result = fieldMatch("329.00", "329.00", {
      key: "SUM",
      type: "money",
      tolerance: 0.01,
    });

    expect(result.status).toBe("exact");
    expect(result.score).toBe(1);
  });

  test("matches money within tolerance", () => {
    const result = fieldMatch("329.005", "329.00", {
      key: "SUM",
      type: "money",
      tolerance: 0.01,
    });

    expect(result.status).toBe("exact");
  });

  test("returns fuzzy or miss for near text matches", () => {
    const result = fieldMatch("Tsingtao Premium", "Tsingtao Premium Lager", {
      key: "NAME",
      type: "text",
    });

    expect(["fuzzy", "miss"]).toContain(result.status);
    expect(result.score).toBeLessThan(1);
  });

  test("handles missing ground truth", () => {
    const result = fieldMatch("x", null, {
      key: "X",
      type: "text",
    });

    expect(result.status).toBe("missing_gt");
  });
});

describe("orderMatch", () => {
  test("pairs rows by name similarity", () => {
    const predicted = [
      { NAME: "Lager", PRICE: 329, QUANTITY: 1 },
      { NAME: "Coffee", PRICE: 200, QUANTITY: 2 },
    ];
    const expected = [
      { NAME: "Coffee", PRICE: 200, QUANTITY: 2 },
      { NAME: "Tsingtao Lager", PRICE: 329, QUANTITY: 1 },
    ];

    const rows = orderMatch(predicted, expected, {
      key: "ORDER",
      rowKey: "NAME",
      fields: [
        { key: "NAME", type: "text" },
        { key: "PRICE", type: "money", tolerance: 0.01 },
        { key: "QUANTITY", type: "number" },
      ],
    });

    expect(rows).toHaveLength(2);
    const coffee = rows.find((row) =>
      row.fields.some(
        (field) => field.key === "NAME" && String(field.predicted).includes("Coffee")
      )
    );
    expect(coffee?.score).toBeGreaterThan(0.9);
  });
});

describe("scoreRun", () => {
  const schema = {
    fields: [
      { key: "SUM", type: "money", tolerance: 0.01 },
      { key: "DATE", type: "date" },
    ],
    arrays: [],
  } as const;

  test("summarizes per-approach scores", () => {
    const groundTruth = { SUM: "329.00", DATE: "27.12.25" };
    const ok = { fields: { SUM: "329.00", DATE: "27.12.25" } };
    const bad = { fields: { SUM: "1.00", DATE: "01.01.00" } };

    const metrics = scoreRun(
      { classical: bad, vlm: ok, hybrid: ok },
      groundTruth,
      schema as any
    );

    expect(metrics.summary.vlm).toBe(1);
    expect(metrics.summary.classical).toBeLessThan(0.5);
  });
});
