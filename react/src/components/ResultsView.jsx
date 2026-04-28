// src/components/ResultsView.jsx
import React from "react";
import { Card, Image, Typography } from "antd";
import { API_BASE_URL } from "../api/client";
const { Paragraph } = Typography;

export default function ResultsView({ data }) {
  if (!data?.results?.length) {
    return null;
  }

  return (
    <Card title="Detection Output" style={{ marginTop: 16 }}>
      <Image
        src={`${API_BASE_URL}${data.results[0].image_url}`}
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
