import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Progress,
  Space,
  Table,
  Tag,
  Upload,
  message,
} from "antd";
import {
  DownloadOutlined,
  PlayCircleOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  downloadBenchmarkCsvApi,
  startBenchmarkApi,
  uploadBenchmarkZipApi,
} from "../api/benchmarks";
import {
  clearBenchmarkDetail,
  loadBenchmarkDetail,
} from "../features/benchmarks/benchmarksSlice";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function BenchmarkDetailPage() {
  const { id } = useParams();
  const benchmarkId = Number(id);
  const dispatch = useDispatch();
  const { detail, detailStatus } = useSelector((state) => state.benchmarks);
  const [zipFile, setZipFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    dispatch(loadBenchmarkDetail(benchmarkId));

    return () => {
      dispatch(clearBenchmarkDetail());
    };
  }, [benchmarkId, dispatch]);

  useEffect(() => {
    if (detail?.benchmark?.status !== "running") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      dispatch(loadBenchmarkDetail(benchmarkId));
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [benchmarkId, detail?.benchmark?.status, dispatch]);

  const benchmark = detail?.benchmark ?? null;
  const items = detail?.items ?? [];
  const report = detail?.report ?? null;

  const progressPercent = useMemo(() => {
    if (!benchmark?.totalItems) {
      return 0;
    }

    return Math.round(
      ((benchmark.doneItems + benchmark.failedItems) / benchmark.totalItems) * 100
    );
  }, [benchmark]);

  if (detailStatus === "loading" && !detail) {
    return <Card loading />;
  }

  if (!benchmark) {
    return <Empty description="Benchmark not found" />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card
        title={`${benchmark.name} (${benchmark.documentType})`}
        extra={<Tag color={benchmark.status === "done" ? "green" : "blue"}>{benchmark.status}</Tag>}
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Upload
            accept=".zip"
            beforeUpload={(file) => {
              setZipFile(file);
              return false;
            }}
            maxCount={1}
            fileList={zipFile ? [zipFile] : []}
            onRemove={() => setZipFile(null)}
          >
            <Button icon={<UploadOutlined />}>Select zip</Button>
          </Upload>

          <Button
            type="primary"
            loading={uploading}
            disabled={!zipFile || benchmark.status === "running"}
            onClick={async () => {
              setUploading(true);

              try {
                await uploadBenchmarkZipApi(benchmarkId, zipFile);
                setZipFile(null);
                message.success("Benchmark zip uploaded");
                dispatch(loadBenchmarkDetail(benchmarkId));
              } catch (error) {
                message.error(
                  error.response?.data?.error ||
                    error.response?.data?.message ||
                    error.message
                );
              } finally {
                setUploading(false);
              }
            }}
          >
            Upload
          </Button>

          <Button
            icon={<PlayCircleOutlined />}
            loading={starting}
            disabled={
              benchmark.status === "running" ||
              !benchmark.totalItems ||
              items.length > 0
            }
            onClick={async () => {
              setStarting(true);

              try {
                await startBenchmarkApi(benchmarkId);
                message.success("Benchmark started");
                dispatch(loadBenchmarkDetail(benchmarkId));
              } catch (error) {
                message.error(
                  error.response?.data?.error ||
                    error.response?.data?.message ||
                    error.message
                );
              } finally {
                setStarting(false);
              }
            }}
          >
            Run
          </Button>

          <Button
            icon={<DownloadOutlined />}
            loading={downloading}
            disabled={!items.length}
            onClick={async () => {
              setDownloading(true);

              try {
                const { data } = await downloadBenchmarkCsvApi(benchmarkId);
                downloadBlob(data, `benchmark-${benchmarkId}.csv`);
              } catch (error) {
                message.error(
                  error.response?.data?.error ||
                    error.response?.data?.message ||
                    error.message
                );
              } finally {
                setDownloading(false);
              }
            }}
          >
            Export CSV
          </Button>
        </Space>

        <Progress
          percent={progressPercent}
          status={benchmark.status === "failed" ? "exception" : undefined}
        />

        <Descriptions size="small" column={4} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Total">{benchmark.totalItems}</Descriptions.Item>
          <Descriptions.Item label="Done">{benchmark.doneItems}</Descriptions.Item>
          <Descriptions.Item label="Failed">{benchmark.failedItems}</Descriptions.Item>
          <Descriptions.Item label="Created">
            {new Date(benchmark.createdAt).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {report ? (
        <Card title="Aggregate report">
          <Table
            rowKey="approach"
            pagination={false}
            dataSource={report.perApproach}
            columns={[
              {
                title: "Approach",
                dataIndex: "approach",
                width: 140,
                render: (value) => value.toUpperCase(),
              },
              {
                title: "Mean accuracy",
                render: (_, record) =>
                  record.accuracyMean == null
                    ? "-"
                    : `${(record.accuracyMean * 100).toFixed(1)}%`,
              },
              {
                title: "Mean latency",
                render: (_, record) =>
                  record.latencyMeanMs == null
                    ? "-"
                    : `${record.latencyMeanMs.toFixed(0)} ms`,
              },
              {
                title: "p50",
                render: (_, record) =>
                  record.latencyP50Ms == null
                    ? "-"
                    : `${record.latencyP50Ms.toFixed(0)} ms`,
              },
              {
                title: "p95",
                render: (_, record) =>
                  record.latencyP95Ms == null
                    ? "-"
                    : `${record.latencyP95Ms.toFixed(0)} ms`,
              },
              {
                title: "Scored",
                dataIndex: "scoredCount",
                width: 120,
              },
            ]}
          />
        </Card>
      ) : null}

      <Card title={`Items (${items.length})`}>
        <Table
          rowKey="id"
          pagination={{ pageSize: 20 }}
          dataSource={items}
          columns={[
            {
              title: "Run",
              dataIndex: "id",
              width: 90,
              render: (value) => <Link to={`/runs/${value}`}>{value}</Link>,
            },
            {
              title: "File",
              dataIndex: "filename",
            },
            {
              title: "GT",
              dataIndex: "hasGroundTruth",
              width: 90,
              render: (value) => (value ? "Yes" : "No"),
            },
            {
              title: "C",
              width: 90,
              render: (_, record) =>
                record.summary?.classical == null
                  ? "-"
                  : `${(record.summary.classical * 100).toFixed(0)}%`,
            },
            {
              title: "V",
              width: 90,
              render: (_, record) =>
                record.summary?.vlm == null
                  ? "-"
                  : `${(record.summary.vlm * 100).toFixed(0)}%`,
            },
            {
              title: "H",
              width: 90,
              render: (_, record) =>
                record.summary?.hybrid == null
                  ? "-"
                  : `${(record.summary.hybrid * 100).toFixed(0)}%`,
            },
            {
              title: "Recommended",
              dataIndex: "recommended",
              render: (value) =>
                value ? <Tag color="green">{value}</Tag> : "-",
            },
          ]}
        />
      </Card>
    </Space>
  );
}
