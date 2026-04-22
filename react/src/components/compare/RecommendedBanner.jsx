import React from "react";
import { Alert } from "antd";

export default function RecommendedBanner({ recommended }) {
  if (!recommended) {
    return null;
  }

  return (
    <Alert
      type="success"
      showIcon
      style={{ marginBottom: 16 }}
      message={`Recommended approach: ${String(recommended).toUpperCase()}`}
    />
  );
}
