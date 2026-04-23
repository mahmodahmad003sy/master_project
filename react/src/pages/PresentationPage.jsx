import React, { useEffect, useState } from "react";
import { Alert, Card, Col, Empty, Row, Spin, Typography } from "antd";
import { useParams, useSearchParams } from "react-router-dom";
import { fetchPublicRunApi, publicRunImageSrc } from "../api/compare";
import ApproachColumn from "../components/compare/ApproachColumn";
import RecommendedBanner from "../components/compare/RecommendedBanner";
import TimingBar from "../components/compare/TimingBar";

const { Title, Text } = Typography;

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

export default function PresentationPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setPayload(null);
    setError(null);

    fetchPublicRunApi(id, token)
      .then(({ data }) => {
        if (active) {
          setPayload(data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.error ||
              requestError.response?.data?.message ||
              requestError.message
          );
        }
      });

    return () => {
      active = false;
    };
  }, [id, token]);

  const schema = payload?.documentType?.schema || { fields: [], arrays: [] };
  const byApproach = {
    classical: payload?.artifacts?.classical || null,
    vlm: payload?.artifacts?.vlm || null,
    hybrid: payload?.artifacts?.hybrid || null,
  };
  const agreements = computeAgreements(schema.fields, byApproach);
  const metrics = payload?.artifacts?.metrics || null;
  const fieldScores = {
    classical: mapFieldScores(metrics, "classical"),
    vlm: mapFieldScores(metrics, "vlm"),
    hybrid: mapFieldScores(metrics, "hybrid"),
  };

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <Alert type="error" message={String(error)} showIcon />
      </div>
    );
  }

  if (!payload) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fb", padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          {payload.run.filename}
        </Title>
        <Text type="secondary">Public presentation view for run #{payload.run.id}</Text>
      </div>

      <RecommendedBanner recommended={payload.run.recommended} />
      <TimingBar timings={payload.run.timings} />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card title="Image" size="small" style={{ height: "100%" }}>
            {payload.run.id ? (
              <img
                alt={payload.run.filename}
                src={publicRunImageSrc(payload.run.id, token)}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  display: "block",
                  marginBottom: 12,
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}

            <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#666" }}>
              <div>
                size: {payload.run.imageW ?? "?"} x {payload.run.imageH ?? "?"}
              </div>
              <div>device: {payload.run.device ?? "unknown"}</div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={6}>
          <ApproachColumn
            title="Classical"
            data={byApproach.classical}
            timeMs={payload.run.timings?.classical}
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
            timeMs={payload.run.timings?.vlm}
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
            timeMs={payload.run.timings?.hybrid}
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
