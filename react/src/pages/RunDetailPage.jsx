import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Typography,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { fetchRunImageBlob } from "../api/compare";
import ApproachColumn from "../components/compare/ApproachColumn";
import GroundTruthDrawer from "../components/compare/GroundTruthDrawer";
import RecommendedBanner from "../components/compare/RecommendedBanner";
import TimingBar from "../components/compare/TimingBar";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";
import { clearDetail, loadRunDetail } from "../features/runs/runsSlice";

const { Title } = Typography;

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

function computeAgreements(schemaFields, byApproach) {
  const output = {};

  schemaFields.forEach((field) => {
    const values = ["classical", "vlm", "hybrid"]
      .map((key) => normalizeFieldValue(extractFieldBag(byApproach[key])[field.key]))
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
    output[field.key] =
      maxCount === values.length ? "all" : maxCount >= 2 ? "two" : "alone";
  });

  return output;
}

function mapFieldScores(metrics, approach) {
  const scores = metrics?.perApproach?.[approach]?.fields || [];
  return Object.fromEntries(scores.map((field) => [field.key, field]));
}

export default function RunDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { detail, detailStatus, detailError } = useSelector((state) => state.runs);
  const { items: documentTypes } = useSelector((state) => state.documentTypes);
  const [imageUrl, setImageUrl] = useState(null);
  const [groundTruthOpen, setGroundTruthOpen] = useState(false);

  useEffect(() => {
    dispatch(loadDocumentTypes());
    dispatch(loadRunDetail(Number(id)));

    return () => {
      dispatch(clearDetail());
    };
  }, [dispatch, id]);

  useEffect(() => {
    if (!detail?.run?.id) {
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

    fetchRunImageBlob(detail.run.id)
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
  }, [detail]);

  const schema = useMemo(() => {
    if (!detail) {
      return { fields: [], arrays: [] };
    }

    const documentType = documentTypes.find(
      (item) => item.key === detail.run.documentType
    );
    return documentType?.schema || { fields: [], arrays: [] };
  }, [detail, documentTypes]);

  if (detailStatus === "loading" || (!detail && detailStatus !== "fail")) {
    return <Spin />;
  }

  if (detailStatus === "fail") {
    return <Alert type="error" showIcon message={String(detailError)} />;
  }

  const byApproach = {
    classical: detail?.artifacts?.classical || null,
    vlm: detail?.artifacts?.vlm || null,
    hybrid: detail?.artifacts?.hybrid || null,
  };
  const agreements = computeAgreements(schema.fields, byApproach);
  const metrics = detail?.artifacts?.metrics || null;
  const groundTruth = detail?.artifacts?.groundTruth || null;
  const fieldScores = {
    classical: mapFieldScores(metrics, "classical"),
    vlm: mapFieldScores(metrics, "vlm"),
    hybrid: mapFieldScores(metrics, "hybrid"),
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/runs")}>
          Back
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          Run #{detail.run.id} - {detail.run.filename}
        </Title>
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => setGroundTruthOpen(true)}>
          {groundTruth ? "Edit ground truth" : "Add ground truth"}
        </Button>
      </Space>

      <GroundTruthDrawer
        open={groundTruthOpen}
        onClose={() => setGroundTruthOpen(false)}
        runId={detail.run.id}
        initialGt={groundTruth}
      />

      <RecommendedBanner recommended={detail.run.recommended} />
      <TimingBar timings={detail.run.timings} />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card title="Image" size="small" style={{ height: "100%" }}>
            {imageUrl ? (
              <img
                alt={detail.run.filename}
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
              <div>
                size: {detail.run.imageW ?? "?"} x {detail.run.imageH ?? "?"}
              </div>
              <div>device: {detail.run.device ?? "unknown"}</div>
              <div>created: {new Date(detail.run.createdAt).toLocaleString()}</div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={6}>
          <ApproachColumn
            title="Classical"
            data={byApproach.classical}
            timeMs={detail.run.timings?.classical}
            agreements={agreements}
            schemaFields={schema.fields}
            schemaArrays={schema.arrays}
            score={metrics?.summary?.classical ?? null}
            fieldScoresByKey={fieldScores.classical}
          />
        </Col>

        <Col xs={24} lg={6}>
          <ApproachColumn
            title="VLM"
            data={byApproach.vlm}
            timeMs={detail.run.timings?.vlm}
            agreements={agreements}
            schemaFields={schema.fields}
            schemaArrays={schema.arrays}
            score={metrics?.summary?.vlm ?? null}
            fieldScoresByKey={fieldScores.vlm}
          />
        </Col>

        <Col xs={24} lg={6}>
          <ApproachColumn
            title="Hybrid"
            data={byApproach.hybrid}
            timeMs={detail.run.timings?.hybrid}
            agreements={agreements}
            schemaFields={schema.fields}
            schemaArrays={schema.arrays}
            score={metrics?.summary?.hybrid ?? null}
            fieldScoresByKey={fieldScores.hybrid}
          />
        </Col>
      </Row>
    </div>
  );
}
