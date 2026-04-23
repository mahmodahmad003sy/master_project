import React from "react";
import {
  Card,
  Collapse,
  Descriptions,
  Divider,
  Empty,
  Statistic,
  Table,
  Typography,
} from "antd";
import { JsonView, allExpanded, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import FieldCell from "./FieldCell";
import ScoreBadge from "./ScoreBadge";

const { Text } = Typography;

function getFieldBag(data) {
  if (!data || typeof data !== "object") {
    return {};
  }

  if (data.fields && typeof data.fields === "object") {
    return data.fields;
  }

  return data;
}

function getConfidence(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (typeof data.confidence === "number") {
    return data.confidence;
  }

  const receiptConfidence = data?.meta?.confidence?.receipt_confidence;
  return typeof receiptConfidence === "number" ? receiptConfidence : null;
}

export default function ApproachColumn({
  title,
  data,
  timeMs,
  agreements,
  schemaFields,
  schemaArrays,
  score = null,
  fieldScoresByKey = null,
}) {
  if (!data) {
    return (
      <Card
        title={
          <span>
            {title} <ScoreBadge score={score} />
          </span>
        }
        size="small"
        style={{ height: "100%" }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary">No result</Text>}
        />
      </Card>
    );
  }

  const fields = getFieldBag(data);
  const confidence = getConfidence(data);

  return (
    <Card
      title={
        <span>
          {title} <ScoreBadge score={score} />
        </span>
      }
      size="small"
      style={{ height: "100%" }}
    >
      <div
        style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}
      >
        {confidence != null ? (
          <Statistic title="Confidence" value={confidence} precision={3} />
        ) : null}
        {timeMs != null ? <Statistic title="Time (ms)" value={timeMs} /> : null}
      </div>

      <Descriptions size="small" column={1} bordered>
        {schemaFields.map((field) => (
          <Descriptions.Item key={field.key} label={field.label || field.key}>
            <FieldCell
              value={fields[field.key]}
              agreement={agreements[field.key]}
              fieldScore={fieldScoresByKey?.[field.key]}
            />
          </Descriptions.Item>
        ))}
      </Descriptions>

      {schemaArrays.map((fieldArray) => {
        const rows = Array.isArray(fields[fieldArray.key]) ? fields[fieldArray.key] : [];
        if (!rows.length) {
          return null;
        }

        return (
          <div key={fieldArray.key} style={{ marginTop: 16 }}>
            <Divider orientation="left">{fieldArray.label || fieldArray.key}</Divider>
            <Table
              size="small"
              rowKey={(_, index) => `${fieldArray.key}-${index}`}
              pagination={false}
              scroll={{ x: true }}
              dataSource={rows}
              columns={fieldArray.fields.map((subField) => ({
                title: subField.label || subField.key,
                dataIndex: subField.key,
                render: (value) => <FieldCell value={value} />,
              }))}
            />
          </div>
        );
      })}

      <div style={{ marginTop: 16 }}>
        <Collapse
          size="small"
          items={[
            {
              key: "raw-json",
              label: "Raw JSON",
              children: (
                <div style={{ overflowX: "auto" }}>
                  <JsonView
                    data={data}
                    shouldExpandNode={allExpanded}
                    style={defaultStyles}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </Card>
  );
}
