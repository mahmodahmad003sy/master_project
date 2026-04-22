import React from "react";
import { Tag } from "antd";

const AGREEMENT_COLORS = {
  all: "#d9f7be",
  two: "#fff1b8",
  alone: "#ffa39e",
  solo: "#f5f5f5",
};

export default function FieldCell({ value, agreement = "solo" }) {
  const color = AGREEMENT_COLORS[agreement] || AGREEMENT_COLORS.solo;

  return (
    <div
      style={{
        background: color,
        borderRadius: 6,
        padding: "6px 8px",
        minHeight: 34,
      }}
    >
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
  );
}
