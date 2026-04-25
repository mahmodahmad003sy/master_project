import { DocumentType } from "../entities/DocumentType";

export function collectCanonicalLabels(dt: DocumentType): Set<string> {
  const labels = new Set<string>();
  const schema: any = dt.schema ?? {};

  for (const field of schema.fields ?? []) {
    if (field?.key) {
      labels.add(field.key);
    }
  }

  for (const arrayField of schema.arrays ?? []) {
    if (arrayField?.key) {
      labels.add(arrayField.key);
    }

    for (const field of arrayField?.fields ?? []) {
      if (field?.key) {
        labels.add(field.key);
      }
    }
  }

  return labels;
}

export function validateDetectorConfigAgainstSchema(dt: DocumentType): void {
  const allowed = collectCanonicalLabels(dt);
  const cfg = dt.detectorConfig;

  if (!cfg) {
    throw { statusCode: 400, message: "detectorConfig is required to activate" };
  }

  for (const label of Object.values(cfg.classMap ?? {})) {
    if (!allowed.has(label)) {
      throw {
        statusCode: 400,
        message: `classMap label "${label}" is not present in schema`,
      };
    }
  }

  for (const label of Object.keys(cfg.labelRoles ?? {})) {
    if (!allowed.has(label)) {
      throw {
        statusCode: 400,
        message: `labelRoles label "${label}" is not present in schema`,
      };
    }
  }
}

const CONFIG_KEYS_THAT_BUMP_VERSION = [
  "schema",
  "detectorConfig",
  "promptTemplate",
] as const;

export function shouldBumpVersion(
  before: Pick<DocumentType, "schema" | "detectorConfig" | "promptTemplate">,
  after: Partial<DocumentType>
): boolean {
  return CONFIG_KEYS_THAT_BUMP_VERSION.some(
    (key) =>
      key in after &&
      JSON.stringify((before as any)[key]) !== JSON.stringify((after as any)[key])
  );
}
