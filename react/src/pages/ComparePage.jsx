import React, { useEffect, useMemo, useState } from "react";
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
import {
  CloudUploadOutlined,
  LinkOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { createShareLinkApi, runImageSrc } from "../api/compare";
import ApproachColumn from "../components/compare/ApproachColumn";
import GroundTruthDrawer from "../components/compare/GroundTruthDrawer";
import RecommendedBanner from "../components/compare/RecommendedBanner";
import TimingBar from "../components/compare/TimingBar";
import { resetComparison, runComparison } from "../features/comparison/comparisonSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";
import { clearDetail, loadRunDetail } from "../features/runs/runsSlice";

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

function mapFieldScores(metrics, approach) {
  const scores = metrics?.perApproach?.[approach]?.fields || [];
  return Object.fromEntries(scores.map((field) => [field.key, field]));
}

export default function ComparePage() {
  const dispatch = useDispatch();
  const documentTypesState = useSelector((state) => state.documentTypes);
  const comparisonState = useSelector((state) => state.comparison);
  const runsDetail = useSelector((state) => state.runs.detail);
  const [documentType, setDocumentType] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [groundTruthOpen, setGroundTruthOpen] = useState(false);

  useEffect(() => {
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  const activeDocumentTypes = useMemo(
    () =>
      documentTypesState.items.filter((item) => item.status === "active"),
    [documentTypesState.items]
  );

  useEffect(() => {
    if (
      documentType &&
      activeDocumentTypes.find((item) => item.key === documentType)
    ) {
      return;
    }

    setDocumentType(activeDocumentTypes[0]?.key ?? null);
  }, [activeDocumentTypes, documentType]);

  useEffect(() => {
    if (comparisonState.status === "ok" && comparisonState.currentRunId) {
      dispatch(loadRunDetail(comparisonState.currentRunId));
    }
  }, [comparisonState.currentRunId, comparisonState.status, dispatch]);

  useEffect(
    () => () => {
      dispatch(clearDetail());
    },
    [dispatch]
  );

  const schema = getSchemaFor(activeDocumentTypes, documentType);
  const byApproach = {
    classical: comparisonState.response?.main || null,
    vlm: comparisonState.response?.qwen || null,
    hybrid: comparisonState.response?.hybrid || null,
  };
  const agreements = computeAgreements(schema.fields, byApproach);
  const detail =
    runsDetail?.run?.id === comparisonState.currentRunId ? runsDetail : null;
  const metrics = detail?.artifacts?.metrics || null;
  const groundTruth = detail?.artifacts?.groundTruth || null;

  const fieldScores = useMemo(
    () => ({
      classical: mapFieldScores(metrics, "classical"),
      vlm: mapFieldScores(metrics, "vlm"),
      hybrid: mapFieldScores(metrics, "hybrid"),
    }),
    [metrics]
  );
  const imageSrc =
    comparisonState.currentRunId && comparisonState.status === "ok"
      ? runImageSrc(comparisonState.currentRunId)
      : null;

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
    dispatch(clearDetail());
    setFileList([]);
    setGroundTruthOpen(false);
  };

  const handleShare = async () => {
    if (!comparisonState.currentRunId) {
      return;
    }

    try {
      const { data } = await createShareLinkApi(comparisonState.currentRunId, 72);
      await navigator.clipboard.writeText(
        `${window.location.origin}${data.url}`
      );
      message.success("Share link copied");
    } catch (error) {
      message.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  };

  return (
    <div>
      <Title level={3}>Compare approaches</Title>
      <Text type="secondary">
        Upload one document image and compare the classical, VLM, and hybrid
        extraction outputs side by side.
      </Text>

      {documentTypesState.status === "fail" ? (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16, marginBottom: 16 }}
          message={String(documentTypesState.error)}
        />
      ) : null}

      {activeDocumentTypes.length === 0 &&
      documentTypesState.status !== "loading" ? (
        <Card style={{ marginTop: 16, marginBottom: 16 }}>
          <Empty
            description="No active document types"
          >
            <Button type="primary">
              <Link to="/document-types">Go to Document Types</Link>
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card style={{ marginTop: 16, marginBottom: 16 }}>
          <Space wrap size="middle">
            <Select
              placeholder="Document type"
              style={{ width: 220 }}
              value={documentType}
              onChange={setDocumentType}
              loading={documentTypesState.status === "loading"}
              options={activeDocumentTypes.map((item) => ({
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

            <Button
              onClick={() => setGroundTruthOpen(true)}
              disabled={!comparisonState.currentRunId}
            >
              {groundTruth ? "Edit ground truth" : "Add ground truth"}
            </Button>

            <Button
              icon={<LinkOutlined />}
              onClick={handleShare}
              disabled={!comparisonState.currentRunId}
            >
              Share
            </Button>

            <Button
              onClick={handleReset}
              disabled={comparisonState.status === "running"}
            >
              Reset
            </Button>
          </Space>
        </Card>
      )}

      <GroundTruthDrawer
        open={groundTruthOpen}
        onClose={() => setGroundTruthOpen(false)}
        runId={comparisonState.currentRunId}
        initialGt={groundTruth}
      />

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
                {imageSrc ? (
                  <img
                    alt={comparisonState.run?.filename || "uploaded document"}
                    src={imageSrc}
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
                score={metrics?.summary?.classical ?? null}
                fieldScoresByKey={fieldScores.classical}
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
                score={metrics?.summary?.vlm ?? null}
                fieldScoresByKey={fieldScores.vlm}
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
                score={metrics?.summary?.hybrid ?? null}
                fieldScoresByKey={fieldScores.hybrid}
              />
            </Col>
          </Row>
        </>
      ) : null}
    </div>
  );
}
