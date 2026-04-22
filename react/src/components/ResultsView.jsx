// src/components/ResultsView.jsx
import React from "react";
import { Card, Image, Typography } from "antd";
const { Paragraph } = Typography;

export default function ResultsView({ data }) {
  const BASE = process.env.REACT_APP_API_URL || "http://localhost:3000";
  if (!data?.results?.length) {
    return null;
  }

  return (
    <Card title="Detection Output" style={{ marginTop: 16 }}>
      <Image
        src={`${BASE}${data.results[0].image_url}`}
        alt="Annotated"
        style={{ maxWidth: "100%", marginBottom: 16 }}
      />

      {/* simple, built‑in JSON pretty print: */}
      <Paragraph>
        <pre>{JSON.stringify(data.results, null, 2)}</pre>
      </Paragraph>
    </Card>
  );
}
