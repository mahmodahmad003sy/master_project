import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Typography,
  message,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { JsonView, allExpanded, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { useDispatch } from "react-redux";
import {
  clearGroundTruth,
  saveGroundTruth,
} from "../../features/runs/runsSlice";

const { Paragraph } = Typography;
const { TextArea } = Input;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function hasStructuredSchema(schema) {
  return Boolean(schema?.fields?.length || schema?.arrays?.length);
}

function initializeDraft(initialGt, schema) {
  const base =
    initialGt && typeof initialGt === "object" && !Array.isArray(initialGt)
      ? cloneJson(initialGt)
      : {};

  for (const arraySpec of schema?.arrays ?? []) {
    if (!Array.isArray(base[arraySpec.key])) {
      base[arraySpec.key] = [];
    }
  }

  return base;
}

function isMeaningfulValue(value) {
  if (value == null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim() !== "";
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

function normalizeFieldValue(spec, value) {
  if (value == null || value === "") {
    return undefined;
  }

  if (spec.type === "number" || spec.type === "money") {
    if (typeof value === "number") {
      return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return String(value).trim();
}

function buildEmptyRow(arraySpec) {
  return Object.fromEntries(
    (arraySpec?.fields ?? []).map((field) => [field.key, null]),
  );
}

function cleanGroundTruth(draft, schema) {
  if (!hasStructuredSchema(schema)) {
    return draft;
  }

  const output = {};
  const knownKeys = new Set();

  for (const field of schema.fields ?? []) {
    knownKeys.add(field.key);
    const value = normalizeFieldValue(field, draft?.[field.key]);
    if (value !== undefined) {
      output[field.key] = value;
    }
  }

  for (const arraySpec of schema.arrays ?? []) {
    knownKeys.add(arraySpec.key);
    const rows = Array.isArray(draft?.[arraySpec.key]) ? draft[arraySpec.key] : [];
    const nextRows = rows
      .map((row) => {
        const nextRow = {};
        for (const field of arraySpec.fields ?? []) {
          const value = normalizeFieldValue(field, row?.[field.key]);
          if (value !== undefined) {
            nextRow[field.key] = value;
          }
        }
        return nextRow;
      })
      .filter((row) => Object.keys(row).length > 0);

    if (nextRows.length > 0) {
      output[arraySpec.key] = nextRows;
    }
  }

  for (const [key, value] of Object.entries(draft ?? {})) {
    if (!knownKeys.has(key) && isMeaningfulValue(value)) {
      output[key] = value;
    }
  }

  return output;
}

function renderValueInput(spec, value, onChange) {
  if (spec.type === "number" || spec.type === "money") {
    return (
      <InputNumber
        style={{ width: "100%" }}
        value={typeof value === "number" ? value : undefined}
        onChange={(nextValue) => onChange(nextValue ?? null)}
      />
    );
  }

  return (
    <Input
      value={value ?? ""}
      placeholder={
        spec.type === "date" ? "YYYY-MM-DD or DD.MM.YYYY" : undefined
      }
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function GroundTruthDrawer({
  open,
  onClose,
  runId,
  initialGt,
  schema,
}) {
  const dispatch = useDispatch();
  const [text, setText] = useState("{\n  \n}");
  const [draft, setDraft] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const structuredMode = hasStructuredSchema(schema);

  useEffect(() => {
    setError(null);
    const nextDraft = initializeDraft(initialGt, schema);
    setDraft(nextDraft);
    setText(
      initialGt && typeof initialGt === "object"
        ? JSON.stringify(initialGt, null, 2)
        : "{\n  \n}",
    );
  }, [initialGt, open, schema]);

  const handleSave = async () => {
    let parsed;

    if (structuredMode) {
      parsed = cleanGroundTruth(draft, schema);
    } else {
      try {
        parsed = JSON.parse(text);
      } catch (parseError) {
        setError(`Invalid JSON: ${parseError.message}`);
        return;
      }
    }

    setSaving(true);
    try {
      await dispatch(saveGroundTruth({ id: runId, groundTruth: parsed })).unwrap();
      message.success("Ground truth saved; metrics recomputed");
      onClose();
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      await dispatch(clearGroundTruth(runId)).unwrap();
      message.success("Ground truth removed");
      onClose();
    } catch (clearError) {
      message.error(String(clearError));
    }
  };

  const updateField = (fieldKey, value) => {
    setDraft((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const updateArrayRow = (arrayKey, index, fieldKey, value) => {
    setDraft((prev) => {
      const nextRows = Array.isArray(prev[arrayKey]) ? [...prev[arrayKey]] : [];
      nextRows[index] = {
        ...(nextRows[index] || {}),
        [fieldKey]: value,
      };
      return {
        ...prev,
        [arrayKey]: nextRows,
      };
    });
  };

  const addArrayRow = (arraySpec) => {
    setDraft((prev) => ({
      ...prev,
      [arraySpec.key]: [
        ...(Array.isArray(prev[arraySpec.key]) ? prev[arraySpec.key] : []),
        buildEmptyRow(arraySpec),
      ],
    }));
  };

  const removeArrayRow = (arrayKey, index) => {
    setDraft((prev) => ({
      ...prev,
      [arrayKey]: (Array.isArray(prev[arrayKey]) ? prev[arrayKey] : []).filter(
        (_, rowIndex) => rowIndex !== index,
      ),
    }));
  };

  return (
    <Drawer
      title={`Ground truth - Run #${runId}`}
      open={open}
      onClose={onClose}
      width={640}
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        {error ? <Alert type="error" showIcon message={error} /> : null}

        {structuredMode ? (
          <>
            <Alert
              type="info"
              showIcon
              message="This editor follows the current document schema, so you can edit fields and array rows directly."
            />

            <Card size="small" title="Fields">
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {(schema?.fields ?? []).length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No top-level fields in this schema"
                  />
                ) : (
                  (schema.fields ?? []).map((field) => (
                    <div key={field.key}>
                      <Paragraph strong style={{ marginBottom: 8 }}>
                        {field.label || field.key}
                      </Paragraph>
                      {renderValueInput(field, draft?.[field.key], (value) =>
                        updateField(field.key, value),
                      )}
                    </div>
                  ))
                )}
              </Space>
            </Card>

            {(schema?.arrays ?? []).map((arraySpec) => {
              const rows = Array.isArray(draft?.[arraySpec.key])
                ? draft[arraySpec.key]
                : [];

              return (
                <Card
                  key={arraySpec.key}
                  size="small"
                  title={arraySpec.label || arraySpec.key}
                  extra={
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => addArrayRow(arraySpec)}
                    >
                      Add row
                    </Button>
                  }
                >
                  {rows.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No rows yet"
                    />
                  ) : (
                    <Space direction="vertical" style={{ width: "100%" }} size="middle">
                      {rows.map((row, index) => (
                        <Card
                          key={`${arraySpec.key}-${index}`}
                          size="small"
                          title={`Row ${index + 1}`}
                          extra={
                            <Button
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => removeArrayRow(arraySpec.key, index)}
                            >
                              Remove
                            </Button>
                          }
                        >
                          <Space
                            direction="vertical"
                            style={{ width: "100%" }}
                            size="middle"
                          >
                            {(arraySpec.fields ?? []).map((field) => (
                              <div key={`${arraySpec.key}-${index}-${field.key}`}>
                                <Paragraph strong style={{ marginBottom: 8 }}>
                                  {field.label || field.key}
                                </Paragraph>
                                {renderValueInput(
                                  field,
                                  row?.[field.key],
                                  (value) =>
                                    updateArrayRow(
                                      arraySpec.key,
                                      index,
                                      field.key,
                                      value,
                                    ),
                                )}
                              </div>
                            ))}
                          </Space>
                        </Card>
                      ))}
                    </Space>
                  )}
                </Card>
              );
            })}

            <Divider orientation="left">JSON Preview</Divider>
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              <JsonView
                data={cleanGroundTruth(draft, schema)}
                shouldExpandNode={allExpanded}
                style={defaultStyles}
              />
            </div>
          </>
        ) : (
          <TextArea
            rows={20}
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            style={{ fontFamily: "monospace" }}
          />
        )}

        <Space>
          <Button type="primary" loading={saving} onClick={handleSave}>
            Save
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          {initialGt ? (
            <Popconfirm title="Remove ground truth?" onConfirm={handleClear}>
              <Button danger>Remove</Button>
            </Popconfirm>
          ) : null}
        </Space>
      </Space>
    </Drawer>
  );
}
