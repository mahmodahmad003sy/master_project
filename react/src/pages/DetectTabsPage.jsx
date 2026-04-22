// src/pages/DetectTabsPage.jsx
import React, { useState, useEffect } from "react";
import {
  Tabs,
  Card,
  Select,
  Upload,
  Button,
  Spin,
  message,
  Row,
  Col,
} from "antd";
import { UploadOutlined, CloudUploadOutlined } from "@ant-design/icons";
import { useSelector, useDispatch } from "react-redux";
import { fetchAllModels } from "../features/models/modelsSlice";
import { runDetection } from "../api/detect";
import ResultsView from "../components/ResultsView";

const { Option } = Select;

export default function DetectTabsPage() {
  const dispatch = useDispatch();
  const models = useSelector((state) => state.models.models);

  const [sessions, setSessions] = useState([
    { key: "1", modelId: null, fileList: [], loading: false, result: null },
  ]);
  const [activeKey, setActiveKey] = useState("1");

  useEffect(() => {
    dispatch(fetchAllModels());
  }, [dispatch]);

  const updateSession = (key, changes) => {
    setSessions((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...changes } : s))
    );
  };

  const addSession = () => {
    const key = Date.now().toString();
    setSessions((prev) => [
      ...prev,
      { key, modelId: null, fileList: [], loading: false, result: null },
    ]);
    setActiveKey(key);
  };

  const removeSession = (targetKey) => {
    const filtered = sessions.filter((s) => s.key !== targetKey);
    let newActive = activeKey;
    if (filtered.length && newActive === targetKey) {
      newActive = filtered[0].key;
    }
    setSessions(filtered);
    setActiveKey(newActive);
  };

  const onModelChange = (key, modelId) => updateSession(key, { modelId });
  const onUploadChange = (key, info) =>
    updateSession(key, { fileList: info.fileList.slice(-1), result: null });

  const handleDetect = async (key) => {
    const sess = sessions.find((s) => s.key === key);
    if (!sess.modelId) return message.warn("Select a model");
    if (!sess.fileList.length) return message.warn("Select an image");

    updateSession(key, { loading: true });
    try {
      const file = sess.fileList[0].originFileObj;
      const res = await runDetection(file, sess.modelId);
      updateSession(key, { result: res });
    } catch {
      message.error("Detection failed");
    } finally {
      updateSession(key, { loading: false });
    }
  };

  return (
    <Tabs
      type="editable-card"
      activeKey={activeKey}
      onChange={setActiveKey}
      onEdit={(k, action) => (action === "add" ? addSession() : removeSession(k))}
      hideAdd={false}
      items={sessions.map((s) => ({
        label: `Session ${s.key}`,
        key: s.key,
        closable: sessions.length > 1,
        children: (
          <Card>
            <Select
              placeholder="Select model"
              style={{ width: 240, marginBottom: 16 }}
              value={s.modelId}
              onChange={(v) => onModelChange(s.key, v)}
            >
              {models.map((m) => (
                <Option key={m.id} value={m.id}>
                  {m.name} ({m.type})
                </Option>
              ))}
            </Select>

            <Upload
              accept="image/*"
              fileList={s.fileList}
              beforeUpload={() => false}
              onChange={(info) => onUploadChange(s.key, info)}
              listType="picture-card"
              style={{ marginBottom: 16 }}
            >
              <div>
                <UploadOutlined style={{ fontSize: 24 }} />
                <div>Select Image</div>
              </div>
            </Upload>

            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              disabled={!s.modelId || !s.fileList.length}
              onClick={() => handleDetect(s.key)}
              style={{ marginBottom: 16 }}
            >
              {s.loading ? <Spin /> : "Run Detection"}
            </Button>

            {s.result && (
              <Row gutter={16}>
                <Col span={12}>
                  <ResultsView data={{ ...s.result }} />
                </Col>
              </Row>
            )}
          </Card>
        ),
      }))}
    />
  );
}





