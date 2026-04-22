import React, { useEffect, useState } from "react";
import {
  Button,
  DatePicker,
  Input,
  Popconfirm,
  Select,
  Space,
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
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { fetchRunImageBlob } from "../api/compare";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";
import {
  deleteRun,
  loadRuns,
  setFilters,
  setPagination,
} from "../features/runs/runsSlice";

const { RangePicker } = DatePicker;

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
  const [thumbs, setThumbs] = useState({});

  useEffect(() => {
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  useEffect(() => {
    dispatch(loadRuns());
  }, [dispatch, filters, pagination]);

  useEffect(() => {
    let active = true;
    const activeUrls = [];

    Promise.all(
      items.map(async (item) => {
        try {
          const { data } = await fetchRunImageBlob(item.id);
          const url = URL.createObjectURL(data);
          activeUrls.push(url);
          return [item.id, url];
        } catch {
          return [item.id, null];
        }
      })
    ).then((entries) => {
      if (!active) {
        activeUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setThumbs((current) => {
        Object.values(current).forEach((url) => {
          if (url) {
            URL.revokeObjectURL(url);
          }
        });

        return Object.fromEntries(entries);
      });
    });

    return () => {
      active = false;
      activeUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [items]);

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

  const columns = [
    {
      title: "Image",
      dataIndex: "id",
      width: 84,
      render: (id, record) =>
        thumbs[id] ? (
          <img
            src={thumbs[id]}
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
    {
      title: "Recommended",
      dataIndex: "recommended",
      width: 140,
      render: (value) =>
        value ? <Tag color="green">{value}</Tag> : <Tag bordered={false}>-</Tag>,
    },
    {
      title: "Timings (ms)",
      dataIndex: "timings",
      width: 220,
      render: (timings) =>
        timings ? (
          <Space size={4}>
            <Tag color="blue">C {timings.classical}</Tag>
            <Tag color="orange">V {timings.vlm}</Tag>
            <Tag color="green">H {timings.hybrid}</Tag>
          </Space>
        ) : (
          "-"
        ),
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
        <Button onClick={resetAll}>Reset</Button>
        <Button icon={<ReloadOutlined />} onClick={() => dispatch(loadRuns())} />
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
