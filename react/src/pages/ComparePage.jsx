import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Typography,
  Upload,
  message,
} from "antd";
import { CloudUploadOutlined, UploadOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { fetchRunImageBlob } from "../api/compare";
import ApproachColumn from "../components/compare/ApproachColumn";
import RecommendedBanner from "../components/compare/RecommendedBanner";
import TimingBar from "../components/compare/TimingBar";
import { resetComparison, runComparison } from "../features/comparison/comparisonSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";

const { Text, Title } = Typography;

function getSchemaFor(documentTypes, key) {
  const selected = documentTypes.find((item) => item.key === key);
  return selected?.schema || { fields: [], arrays: [] };
}

function normalizeFieldValue(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value).trim().toLowerCase();
}

function extractFieldBag(data) {
  if (!data || typeof data !== "object") {
    return {};
  }

  if (data.fields && typeof data.fields === "object") {
    return data.fields;
  }

  return data;
}

function computeAgreements(schemaFields, resultsByApproach) {
  const output = {};

  schemaFields.forEach((field) => {
    const values = ["classical", "vlm", "hybrid"]
      .map((key) => normalizeFieldValue(extractFieldBag(resultsByApproach[key])[field.key]))
      .filter((value) => value !== null);

    if (values.length < 2) {
      output[field.key] = "solo";
      return;
    }

    const counts = values.reduce((acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
    const maxCount = Math.max(...Object.values(counts));

    if (maxCount === values.length) {
      output[field.key] = "all";
    } else if (maxCount >= 2) {
      output[field.key] = "two";
    } else {
      output[field.key] = "alone";
    }
  });

  return output;
}

export default function ComparePage() {
  const dispatch = useDispatch();
  const documentTypesState = useSelector((state) => state.documentTypes);
  const comparisonState = useSelector((state) => state.comparison);
  const [documentType, setDocumentType] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  useEffect(() => {
    if (!documentType && documentTypesState.items.length) {
      setDocumentType(documentTypesState.items[0].key);
    }
  }, [documentType, documentTypesState.items]);

  useEffect(() => {
    if (!comparisonState.currentRunId || comparisonState.status !== "ok") {
      setImageUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      return undefined;
    }

    let active = true;
    let objectUrl = null;

    fetchRunImageBlob(comparisonState.currentRunId)
      .then(({ data }) => {
        if (!active) {
          return;
        }

        objectUrl = URL.createObjectURL(data);
        setImageUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return objectUrl;
        });
      })
      .catch(() => {
        if (active) {
          setImageUrl(null);
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [comparisonState.currentRunId, comparisonState.status]);

  const schema = getSchemaFor(documentTypesState.items, documentType);
  const byApproach = {
    classical: comparisonState.response?.main || null,
    vlm: comparisonState.response?.qwen || null,
    hybrid: comparisonState.response?.hybrid || null,
  };
  const agreements = computeAgreements(schema.fields, byApproach);

  const handleRun = () => {
    if (!documentType) {
      message.warning("Pick a document type");
      return;
    }

    if (!fileList.length) {
      message.warning("Select an image");
      return;
    }

    const file = fileList[0].originFileObj || fileList[0];
    dispatch(runComparison({ file, documentType }));
  };

  const handleReset = () => {
    dispatch(resetComparison());
    setFileList([]);
    setImageUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  };

  return (
    <div>
      <Title level={3}>Compare approaches</Title>
      <Text type="secondary">
        Upload one document image and compare the classical, VLM, and hybrid
        extraction outputs side by side.
      </Text>

      <Card style={{ marginTop: 16, marginBottom: 16 }}>
        <Space wrap size="middle">
          <Select
            placeholder="Document type"
            style={{ width: 220 }}
            value={documentType}
            onChange={setDocumentType}
            loading={documentTypesState.status === "loading"}
            options={documentTypesState.items.map((item) => ({
              value: item.key,
              label: item.name,
            }))}
          />

          <Upload
            accept="image/*"
            beforeUpload={() => false}
            fileList={fileList}
            maxCount={1}
            onChange={(info) => setFileList(info.fileList.slice(-1))}
          >
            <Button icon={<UploadOutlined />}>Select image</Button>
          </Upload>

          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={handleRun}
            loading={comparisonState.status === "running"}
            disabled={!documentType || !fileList.length}
          >
            Run comparison
          </Button>

          <Button onClick={handleReset} disabled={comparisonState.status === "running"}>
            Reset
          </Button>
        </Space>
      </Card>

      {documentTypesState.status === "fail" ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={String(documentTypesState.error)}
        />
      ) : null}

      {comparisonState.status === "fail" ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={String(comparisonState.error)}
        />
      ) : null}

      {comparisonState.status === "running" ? (
        <Card>
          <Space>
            <Spin />
            <Text>Running three pipelines. This can take a while.</Text>
          </Space>
        </Card>
      ) : null}

      {comparisonState.status === "ok" && comparisonState.response ? (
        <>
          <RecommendedBanner
            recommended={comparisonState.response.recommended_for_production}
          />
          <TimingBar timings={comparisonState.run?.timings} />

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={6}>
              <Card title="Image" size="small" style={{ height: "100%" }}>
                {imageUrl ? (
                  <img
                    alt={comparisonState.run?.filename || "uploaded document"}
                    src={imageUrl}
                    style={{
                      width: "100%",
                      borderRadius: 8,
                      display: "block",
                      marginBottom: 12,
                    }}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Preview unavailable"
                  />
                )}

                <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#666" }}>
                  <div>file: {comparisonState.run?.filename || "unknown"}</div>
                  <div>
                    size: {comparisonState.run?.imageW ?? "?"} x{" "}
                    {comparisonState.run?.imageH ?? "?"}
                  </div>
                  <div>device: {comparisonState.run?.device ?? "unknown"}</div>
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={6}>
              <ApproachColumn
                title="Classical (OD + OCR)"
                data={byApproach.classical}
                timeMs={comparisonState.run?.timings?.classical}
                agreements={agreements}
                schemaFields={schema.fields}
                schemaArrays={schema.arrays}
              />
            </Col>

            <Col xs={24} lg={6}>
              <ApproachColumn
                title="VLM (OCR-free)"
                data={byApproach.vlm}
                timeMs={comparisonState.run?.timings?.vlm}
                agreements={agreements}
                schemaFields={schema.fields}
                schemaArrays={schema.arrays}
              />
            </Col>

            <Col xs={24} lg={6}>
              <ApproachColumn
                title="Hybrid (OD + VLM)"
                data={byApproach.hybrid}
                timeMs={comparisonState.run?.timings?.hybrid}
                agreements={agreements}
                schemaFields={schema.fields}
                schemaArrays={schema.arrays}
              />
            </Col>
          </Row>
        </>
      ) : null}
    </div>
  );
}
