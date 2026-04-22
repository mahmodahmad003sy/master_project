import React from "react";
import { Tag } from "antd";
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  MinusCircleTwoTone,
} from "@ant-design/icons";

const AGREEMENT_COLORS = {
  all: "#d9f7be",
  two: "#fff1b8",
  alone: "#ffa39e",
  solo: "#f5f5f5",
};

export default function FieldCell({
  value,
  agreement = "solo",
  fieldScore = null,
}) {
  const color = AGREEMENT_COLORS[agreement] || AGREEMENT_COLORS.solo;
  const icon =
    !fieldScore ? null : fieldScore.status === "exact" ? (
      <CheckCircleTwoTone twoToneColor="#52c41a" />
    ) : fieldScore.status === "fuzzy" ? (
      <CheckCircleTwoTone twoToneColor="#faad14" />
    ) : fieldScore.status === "miss" ? (
      <CloseCircleTwoTone twoToneColor="#ff4d4f" />
    ) : (
      <MinusCircleTwoTone twoToneColor="#bfbfbf" />
    );

  return (
    <div
      style={{
        background: color,
        borderRadius: 6,
        padding: "6px 8px",
        minHeight: 34,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        {value == null || value === "" ? (
          <Tag bordered={false}>empty</Tag>
        ) : typeof value === "object" ? (
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(value, null, 2)}
          </pre>
        ) : (
          String(value)
        )}
      </div>
    </div>
  );
}
