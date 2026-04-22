import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Drawer,
  Input,
  Popconfirm,
  Space,
  message,
} from "antd";
import { useDispatch } from "react-redux";
import {
  clearGroundTruth,
  saveGroundTruth,
} from "../../features/runs/runsSlice";

const { TextArea } = Input;

export default function GroundTruthDrawer({
  open,
  onClose,
  runId,
  initialGt,
}) {
  const dispatch = useDispatch();
  const [text, setText] = useState("{\n  \n}");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError(null);
    setText(initialGt ? JSON.stringify(initialGt, null, 2) : "{\n  \n}");
  }, [initialGt, open]);

  const handleSave = async () => {
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      setError(`Invalid JSON: ${parseError.message}`);
      return;
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

  return (
    <Drawer
      title={`Ground truth - Run #${runId}`}
      open={open}
      onClose={onClose}
      width={520}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <TextArea
          rows={20}
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          style={{ fontFamily: "monospace" }}
        />
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
