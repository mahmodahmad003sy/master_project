import React, { useEffect, useState } from "react";
import {
  Button,
  DatePicker,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  exportGroundTruthDatasetApi,
  runImageSrc,
} from "../api/compare";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";
import {
  deleteRun,
  loadRuns,
  setFilters,
  setPagination,
} from "../features/runs/runsSlice";

const { RangePicker } = DatePicker;

function formatSummaryScore(score) {
  return `${Math.round(score * 100)}%`;
}

function versionTag(value) {
  return value != null ? <Tag>v{value}</Tag> : "-";
}

function parseFilenameFromDisposition(headerValue) {
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/filename="?([^"]+)"?/i);
  return match?.[1] || null;
}

async function extractBlobErrorMessage(error) {
  const data = error?.response?.data;
  if (!(data instanceof Blob)) {
    return (
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "export failed"
    );
  }

  try {
    const parsed = JSON.parse(await data.text());
    return parsed.message || parsed.error || error.message || "export failed";
  } catch {
    return error.message || "export failed";
  }
}

export default function RunsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, total, status, filters, pagination } = useSelector(
    (state) => state.runs
  );
  const { items: documentTypes } = useSelector((state) => state.documentTypes);

  const [search, setSearch] = useState(filters.search || "");
  const [documentType, setDocumentType] = useState(filters.documentType);
  const [hasGroundTruth, setHasGroundTruth] = useState(filters.hasGroundTruth);
  const [dateRange, setDateRange] = useState([null, null]);
  const [showAdvancedColumns, setShowAdvancedColumns] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  useEffect(() => {
    dispatch(loadRuns());
  }, [dispatch, filters, pagination]);

  const applyFilters = () => {
    dispatch(
      setFilters({
        search: search || undefined,
        documentType,
        hasGroundTruth,
        dateFrom: dateRange[0]?.toISOString(),
        dateTo: dateRange[1]?.toISOString(),
      })
    );
    dispatch(setPagination({ current: 1 }));
  };

  const resetAll = () => {
    setSearch("");
    setDocumentType(undefined);
    setHasGroundTruth(undefined);
    setDateRange([null, null]);
    dispatch(
      setFilters({
        search: undefined,
        documentType: undefined,
        hasGroundTruth: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      })
    );
    dispatch(setPagination({ current: 1 }));
  };

  const handleDelete = async (id) => {
    try {
      await dispatch(deleteRun(id)).unwrap();
      message.success("Run deleted");
    } catch (error) {
      message.error(String(error));
    }
  };

  const handleExportGroundTruthDataset = async () => {
    setExporting(true);

    try {
      const visibleRunIds = items
        .filter((item) => item.hasGroundTruth)
        .map((item) => item.id);

      if (visibleRunIds.length === 0) {
        message.warning("No visible runs with ground truth to export");
        return;
      }

      const { data, headers } = await exportGroundTruthDatasetApi({
        ...filters,
        hasGroundTruth: "true",
        runIds: visibleRunIds.join(","),
      });
      const filename =
        parseFilenameFromDisposition(headers["content-disposition"]) ||
        "ground-truth-dataset.zip";
      const blobUrl = window.URL.createObjectURL(
        new Blob([data], { type: "application/zip" })
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      message.success("Ground-truth dataset downloaded");
    } catch (error) {
      message.error(await extractBlobErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const advancedColumns = showAdvancedColumns
    ? [
        {
          title: "Doc version",
          dataIndex: "documentTypeVersion",
          width: 100,
          render: (value) => versionTag(value),
        },
        {
          title: "Detector",
          dataIndex: "detectorModelId",
          width: 110,
          render: (value) =>
            value != null ? <Link to="/models">#{value}</Link> : "-",
        },
        {
          title: "Detector version",
          dataIndex: "detectorModelVersion",
          width: 120,
          render: (value) => versionTag(value),
        },
      ]
    : [];

  const columns = [
    {
      title: "Image",
      dataIndex: "id",
      width: 84,
      render: (id, record) =>
        id ? (
          <img
            src={runImageSrc(id)}
            alt={record.filename}
            style={{
              width: 56,
              height: 56,
              objectFit: "cover",
              borderRadius: 6,
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              background: "#f5f5f5",
              color: "#999",
              fontSize: 12,
            }}
          >
            n/a
          </div>
        ),
    },
    {
      title: "ID",
      dataIndex: "id",
      width: 72,
    },
    {
      title: "Filename",
      dataIndex: "filename",
      ellipsis: true,
    },
    {
      title: "Doc type",
      dataIndex: "documentType",
      width: 120,
      render: (value) => <Tag>{value}</Tag>,
    },
    ...advancedColumns,
    {
      title: "Best",
      key: "best",
      width: 140,
      render: (_, record) => {
        if (!record.summary) {
          return "-";
        }

        const best = Object.entries(record.summary).reduce((current, entry) =>
          entry[1] > current[1] ? entry : current
        );
        return (
          <Tag color="geekblue">
            {best[0]} · {formatSummaryScore(best[1])}
          </Tag>
        );
      },
    },
    {
      title: "Scores",
      key: "summary",
      width: 220,
      render: (_, record) =>
        !record.summary ? (
          "-"
        ) : (
          <Space size={4}>
            <Tag color="blue">C {formatSummaryScore(record.summary.classical)}</Tag>
            <Tag color="orange">V {formatSummaryScore(record.summary.vlm)}</Tag>
            <Tag color="green">H {formatSummaryScore(record.summary.hybrid)}</Tag>
          </Space>
        ),
    },
    {
      title: "Recommended",
      dataIndex: "recommended",
      width: 140,
      render: (value) =>
        value ? <Tag color="green">{value}</Tag> : <Tag bordered={false}>-</Tag>,
    },
    {
      title: "GT",
      dataIndex: "hasGroundTruth",
      width: 72,
      render: (value) =>
        value ? (
          <Tooltip title="Has ground truth">
            <CheckCircleTwoTone twoToneColor="#52c41a" />
          </Tooltip>
        ) : (
          <Tooltip title="No ground truth">
            <CloseCircleTwoTone twoToneColor="#d9d9d9" />
          </Tooltip>
        ),
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      width: 190,
      render: (value) => new Date(value).toLocaleString(),
    },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/runs/${record.id}`)}
          >
            Open
          </Button>
          <Popconfirm
            title="Delete this run?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="Search filename"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          allowClear
          style={{ width: 220 }}
        />
        <Select
          placeholder="Document type"
          allowClear
          style={{ width: 180 }}
          value={documentType}
          onChange={setDocumentType}
          options={documentTypes.map((item) => ({
            value: item.key,
            label: item.name,
          }))}
        />
        <Select
          placeholder="Ground truth?"
          allowClear
          style={{ width: 160 }}
          value={hasGroundTruth}
          onChange={setHasGroundTruth}
          options={[
            { value: "true", label: "Has GT" },
            { value: "false", label: "No GT" },
          ]}
        />
        <RangePicker
          value={dateRange}
          onChange={(value) => setDateRange(value || [null, null])}
        />
        <Button type="primary" onClick={applyFilters}>
          Apply
        </Button>
        <Button
          onClick={handleExportGroundTruthDataset}
          loading={exporting}
          disabled={hasGroundTruth === "false"}
        >
          Export GT dataset
        </Button>
        <Button onClick={resetAll}>Reset</Button>
        <Button icon={<ReloadOutlined />} onClick={() => dispatch(loadRuns())} />
        <Space size="small">
          <span>Advanced columns</span>
          <Switch
            checked={showAdvancedColumns}
            onChange={setShowAdvancedColumns}
          />
        </Space>
      </Space>

      <Table
        rowKey="id"
        loading={status === "loading"}
        dataSource={items}
        columns={columns}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) =>
            dispatch(setPagination({ current, pageSize })),
        }}
        onRow={(record) => ({
          onDoubleClick: () => navigate(`/runs/${record.id}`),
        })}
      />
    </div>
  );
}
