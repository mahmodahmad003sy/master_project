import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, DatePicker, Empty, Select, Space, Spin, Tag, Typography } from "antd";
import { useDispatch, useSelector } from "react-redux";
import AccuracyPerField from "../components/analytics/AccuracyPerField";
import ApproachKpis from "../components/analytics/ApproachKpis";
import { loadAnalytics, setAnalyticsFilters } from "../features/analytics/analyticsSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";

const { RangePicker } = DatePicker;
const { Title } = Typography;

export default function AnalyticsPage() {
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((state) => state.analytics);
  const { items: documentTypes } = useSelector((state) => state.documentTypes);
  const [documentType, setDocumentType] = useState(undefined);
  const [range, setRange] = useState([]);

  useEffect(() => {
    dispatch(loadDocumentTypes());
    dispatch(loadAnalytics({}));
  }, [dispatch]);

  const tags = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      { label: "Total runs", value: data.totalRuns },
      { label: "With GT", value: data.withGroundTruth, color: "green" },
      {
        label: "Coverage",
        value:
          data.totalRuns > 0
            ? `${Math.round((data.withGroundTruth / data.totalRuns) * 100)}%`
            : "0%",
        color: "blue",
      },
    ];
  }, [data]);

  const applyFilters = () => {
    const filters = {};

    if (documentType) {
      filters.documentType = documentType;
    }

    if (range?.[0]) {
      filters.from = range[0].toDate().toISOString();
    }

    if (range?.[1]) {
      filters.to = range[1].toDate().toISOString();
    }

    dispatch(setAnalyticsFilters(filters));
    dispatch(loadAnalytics(filters));
  };

  const resetFilters = () => {
    setDocumentType(undefined);
    setRange([]);
    dispatch(setAnalyticsFilters({}));
    dispatch(loadAnalytics({}));
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 8 }}>
          Analytics
        </Title>
      </div>

      <Card>
        <Space wrap>
          <Select
            allowClear
            placeholder="Document type"
            style={{ width: 220 }}
            value={documentType}
            onChange={setDocumentType}
            options={documentTypes.map((item) => ({
              value: item.key,
              label: item.name,
            }))}
          />
          <RangePicker value={range} onChange={(value) => setRange(value || [])} />
          <Button type="primary" onClick={applyFilters}>
            Apply
          </Button>
          <Button onClick={resetFilters}>Reset</Button>
        </Space>
      </Card>

      {status === "loading" && !data ? <Spin /> : null}
      {status === "fail" ? <Alert type="error" message={String(error)} /> : null}

      {data ? (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card>
            <Space wrap>
              {tags.map((item) => (
                <Tag key={item.label} color={item.color}>
                  {item.label}: {item.value}
                </Tag>
              ))}
            </Space>
          </Card>

          <ApproachKpis kpis={data.kpis} />

          <Card title="Accuracy per field">
            {data.perField.length ? (
              <AccuracyPerField data={data.perField} />
            ) : (
              <Empty description="No ground-truth field metrics available for the current filters" />
            )}
          </Card>
        </Space>
      ) : null}
    </Space>
  );
}
