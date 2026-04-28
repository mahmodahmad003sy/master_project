import { In } from "typeorm";
import config from "../config";
import { AppSetting } from "../entities/AppSetting";

export const RUNTIME_SETTING_KEYS = [
  "COMPARE_SERVICE_URL",
  "PUBLIC_API_URL",
  "COLAB_SYNC_TOKEN",
] as const;

export type RuntimeSettingKey = (typeof RUNTIME_SETTING_KEYS)[number];

type RuntimeSettingDefinition = {
  key: RuntimeSettingKey;
  label: string;
  description: string;
  defaultValue: string;
  secret?: boolean;
};

export type RuntimeSettingRecord = {
  key: RuntimeSettingKey;
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  isOverride: boolean;
  secret: boolean;
  updatedAt: string | null;
};

export type RuntimeSettingsMap = Record<RuntimeSettingKey, string>;

const RUNTIME_SETTING_DEFINITIONS: RuntimeSettingDefinition[] = [
  {
    key: "COMPARE_SERVICE_URL",
    label: "Compare Service URL",
    description: "Base URL used by the API to call the Python compare service.",
    defaultValue: config.COMPARE_SERVICE_URL,
  },
  {
    key: "PUBLIC_API_URL",
    label: "Public API URL",
    description: "Public API base URL used for model download links and share URLs.",
    defaultValue: config.PUBLIC_API_URL,
  },
  {
    key: "COLAB_SYNC_TOKEN",
    label: "Colab Sync Token",
    description: "Shared secret required by the Colab sync endpoints.",
    defaultValue: config.COLAB_SYNC_TOKEN,
    secret: true,
  },
];

const RUNTIME_SETTING_DEFINITION_BY_KEY = Object.fromEntries(
  RUNTIME_SETTING_DEFINITIONS.map((definition) => [definition.key, definition]),
) as Record<RuntimeSettingKey, RuntimeSettingDefinition>;

function normalizeValue(key: RuntimeSettingKey, value: string): string {
  const trimmed = String(value ?? "").trim();

  if (key === "COMPARE_SERVICE_URL" || key === "PUBLIC_API_URL") {
    return trimmed.replace(/\/+$/, "");
  }

  return trimmed;
}

async function loadSettingRows(): Promise<Map<string, AppSetting>> {
  const rows = await AppSetting.find({
    where: { key: In([...RUNTIME_SETTING_KEYS]) },
    order: { id: "ASC" },
  });

  return new Map(rows.map((row) => [row.key, row]));
}

export async function getRuntimeSettingsMap(): Promise<RuntimeSettingsMap> {
  const rowsByKey = await loadSettingRows();

  return RUNTIME_SETTING_DEFINITIONS.reduce((acc, definition) => {
    const override = rowsByKey.get(definition.key)?.value;
    acc[definition.key] = normalizeValue(
      definition.key,
      override ?? definition.defaultValue,
    );
    return acc;
  }, {} as RuntimeSettingsMap);
}

export async function getRuntimeSettingValue(
  key: RuntimeSettingKey,
): Promise<string> {
  const values = await getRuntimeSettingsMap();
  return values[key];
}

export async function listRuntimeSettings(): Promise<RuntimeSettingRecord[]> {
  const rowsByKey = await loadSettingRows();

  return RUNTIME_SETTING_DEFINITIONS.map((definition) => {
    const row = rowsByKey.get(definition.key);
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      value: normalizeValue(
        definition.key,
        row?.value ?? definition.defaultValue,
      ),
      defaultValue: normalizeValue(definition.key, definition.defaultValue),
      isOverride: Boolean(row),
      secret: Boolean(definition.secret),
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  });
}

export async function updateRuntimeSettings(
  updates: Partial<Record<RuntimeSettingKey, string | null>>,
): Promise<RuntimeSettingRecord[]> {
  const rowsByKey = await loadSettingRows();

  for (const key of RUNTIME_SETTING_KEYS) {
    if (!(key in updates)) {
      continue;
    }

    const nextRawValue = updates[key];
    const nextValue =
      nextRawValue == null ? "" : normalizeValue(key, String(nextRawValue));
    const existing = rowsByKey.get(key);

    if (!nextValue) {
      if (existing) {
        await existing.remove();
      }
      continue;
    }

    const row = existing ?? AppSetting.create({ key, value: nextValue });
    row.value = nextValue;
    await row.save();
  }

  return listRuntimeSettings();
}

export function isRuntimeSettingKey(value: string): value is RuntimeSettingKey {
  return RUNTIME_SETTING_KEYS.includes(value as RuntimeSettingKey);
}

export { RUNTIME_SETTING_DEFINITIONS, RUNTIME_SETTING_DEFINITION_BY_KEY };
