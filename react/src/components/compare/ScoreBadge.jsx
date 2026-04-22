import React from "react";
import { Tag } from "antd";

export default function ScoreBadge({ score }) {
  if (score == null) {
    return <Tag bordered={false}>-</Tag>;
  }

  const pct = Math.round(score * 100);
  const color =
    pct >= 90 ? "green" : pct >= 70 ? "gold" : pct >= 50 ? "orange" : "red";

  return <Tag color={color}>{pct}%</Tag>;
}
