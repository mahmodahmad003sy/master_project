import React from "react";
import { Card, Col, Row, Statistic } from "antd";

function formatPercent(value) {
  if (value == null) {
    return "-";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatLatency(value) {
  if (value == null) {
    return "-";
  }

  return `${value.toFixed(0)} ms`;
}

export default function ApproachKpis({ kpis }) {
  return (
    <Row gutter={[16, 16]}>
      {kpis.map((item) => (
        <Col xs={24} md={8} key={item.approach}>
          <Card title={item.approach.toUpperCase()} size="small">
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic title="Mean accuracy" value={formatPercent(item.meanAccuracy)} />
              </Col>
              <Col span={12}>
                <Statistic title="Scored runs" value={item.scoredCount} />
              </Col>
              <Col span={24}>
                <Statistic title="Mean latency" value={formatLatency(item.meanLatencyMs)} />
              </Col>
            </Row>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
