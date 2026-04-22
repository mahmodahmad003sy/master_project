import React from "react";
import { Tooltip } from "antd";

const COLORS = {
  classical: "#1677ff",
  vlm: "#fa8c16",
  hybrid: "#52c41a",
};

export default function TimingBar({ timings }) {
  if (!timings) {
    return null;
  }

  const entries = [
    ["classical", Number(timings.classical ?? 0)],
    ["vlm", Number(timings.vlm ?? 0)],
    ["hybrid", Number(timings.hybrid ?? 0)],
  ];
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;

  return (
    <div
      style={{
        display: "flex",
        height: 32,
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 16,
        background: "#f0f0f0",
      }}
    >
      {entries.map(([name, value]) => (
        <Tooltip key={name} title={`${name}: ${value} ms`}>
          <div
            style={{
              width: `${(value / total) * 100}%`,
              background: COLORS[name],
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: value > 0 ? 64 : 0,
              padding: value > 0 ? "0 8px" : 0,
            }}
          >
            {value > 0 ? `${name} ${value} ms` : ""}
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
