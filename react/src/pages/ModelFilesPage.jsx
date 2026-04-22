// src/pages/ModelFilesPage.jsx
import React, { useState, useEffect } from "react";
import {
  Table,
  Input,
  DatePicker,
  Button,
  Modal,
  Space,
  Dropdown,
  Tooltip,
  Row,
  Col,
  Card,
} from "antd";
import {
  FileTextOutlined,
  ReloadOutlined,
  DownOutlined,
  SortAscendingOutlined,
  AppstoreOutlined,
  TableOutlined,
} from "@ant-design/icons";
import client from "../api/client";
import { useSelector, useDispatch } from "react-redux";
import {
  fetchModelFiles,
  setFilters,
  setPagination,
} from "../features/modelFiles/modelFilesSlice";
import { API_BASE_URL } from "../api/client";

const { RangePicker } = DatePicker;

export default function ModelFilesPage() {
  const dispatch = useDispatch();
  const { files, total, loading, filters, pagination } = useSelector(
    (state) => state.modelFiles
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState([null, null]);
  const [thumbs, setThumbs] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewJson, setPreviewJson] = useState(null);
  const [viewType, setViewType] = useState("table");

  useEffect(() => {
    dispatch(fetchModelFiles());
  }, [dispatch, filters, pagination]);

  const makeUrl = (name) => `${API_BASE_URL}/download/${encodeURIComponent(name)}`;

  useEffect(() => {
    files.forEach(({ filename, outputName }) => {
      [filename, outputName].forEach((name) => {
        if (thumbs[name]) return;
        client
          .get(makeUrl(name), {
            responseType: "blob",
          })
          .then((resp) => {
            const url = URL.createObjectURL(resp.data);
            setThumbs((t) => ({ ...t, [name]: url }));
          })
          .catch(console.error);
      });
    });
    return () => {
      Object.values(thumbs).forEach(URL.revokeObjectURL);
    };
  }, [files, thumbs]);

  const exportToCsv = () => {
    if (!files.length) return;
    const header = ["ID", "Filename", "UploadedAt"];
    const rows = files.map((f) => [
      f.id,
      `"${f.filename.replace(/"/g, '""')}"`,
      new Date(f.uploadedAt).toISOString(),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "model-files-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionsMenu = {
    items: [
      { key: "deleteSelected", label: "Delete Selected" },
      { key: "downloadSelected", label: "Download Selected" },
    ],
  };
  const columnsMenu = {
    items: [
      { key: "id", label: "ID" },
      { key: "filename", label: "Filename" },
      { key: "uploadedAt", label: "Uploaded At" },
      { key: "preview", label: "Preview" },
      { key: "json", label: "JSON" },
    ],
  };
  const filtersMenu = {
    items: [
      { key: "hasJson", label: "Has JSON" },
      { key: "dateLastWeek", label: "Uploaded Last Week" },
    ],
  };

  const handleTableChange = ({ current, pageSize }) => {
    dispatch(setPagination({ current, pageSize }));
  };

  const applyFilters = () => {
    dispatch(
      setFilters({
        search: searchTerm.trim() || undefined,
        dateFrom: dateRange[0]?.toDate() || undefined,
        dateTo: dateRange[1]?.toDate() || undefined,
      })
    );
    dispatch(setPagination({ current: 1, pageSize: pagination.pageSize }));
  };

  const resetAll = () => {
    setSearchTerm("");
    setDateRange([null, null]);
    dispatch(setFilters({}));
    dispatch(setPagination({ current: 1, pageSize: pagination.pageSize }));
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 80 },
    { title: "Filename", dataIndex: "filename", ellipsis: true },
    {
      title: "Uploaded At",
      dataIndex: "uploadedAt",
      render: (dt) => new Date(dt).toLocaleString(),
    },
    {
      title: "Image",
      key: "image",
      render: (_, rec) => (
        <img
          src={thumbs[rec.filename]}
          alt={rec.filename}
          style={{
            width: 50,
            height: 50,
            objectFit: "cover",
            cursor: "pointer",
            borderRadius: 4,
          }}
          onClick={() => setPreviewUrl(thumbs[rec.filename])}
        />
      ),
    },
    {
      title: "Output",
      key: "output",
      render: (_, rec) => (
        <img
          src={thumbs[rec.outputName]}
          alt={rec.outputName}
          style={{
            width: 50,
            height: 50,
            objectFit: "cover",
            cursor: "pointer",
            borderRadius: 4,
          }}
          onClick={() => setPreviewUrl(thumbs[rec.outputName])}
        />
      ),
    },
    {
      title: "JSON",
      key: "json",
      render: (_, record) => (
        <Tooltip title="View JSON">
          <FileTextOutlined
            style={{ fontSize: 18, cursor: "pointer" }}
            onClick={() => setPreviewJson(record)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <Space
        style={{
          width: "100%",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Space>
          <Dropdown menu={actionsMenu}>
            <Button>
              Actions <DownOutlined />
            </Button>
          </Dropdown>
          <Dropdown menu={columnsMenu}>
            <Button>
              Columns <DownOutlined />
            </Button>
          </Dropdown>
          <Dropdown menu={filtersMenu}>
            <Button>
              Filters <DownOutlined />
            </Button>
          </Dropdown>
          <Button icon={<SortAscendingOutlined />}>Order By</Button>
          <Button type="primary">Process All</Button>
        </Space>

        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => dispatch(fetchModelFiles())}
          />
          <Button onClick={exportToCsv}>Export</Button>
          <Button
            icon={<AppstoreOutlined />}
            type={viewType === "grid" ? "primary" : undefined}
            onClick={() => setViewType("grid")}
          />
          <Button
            icon={<TableOutlined />}
            type={viewType === "table" ? "primary" : undefined}
            onClick={() => setViewType("table")}
          />
        </Space>
      </Space>

      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Search filename"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          allowClear
          style={{ width: 200 }}
        />
        <RangePicker
          value={dateRange}
          onChange={(moments) => setDateRange(moments)}
        />
        <Button type="primary" onClick={applyFilters}>
          Apply
        </Button>
        <Button onClick={resetAll}>Reset</Button>
      </Space>

      {viewType === "table" ? (
        <Table
          rowKey="id"
          rowSelection={{}}
          columns={columns}
          dataSource={files}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
          }}
          onChange={handleTableChange}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {files.map((rec) => (
            <Col key={rec.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                cover={
                  <img
                    alt={rec.filename}
                    src={thumbs[rec.filename]}
                    style={{
                      height: 120,
                      objectFit: "cover",
                      cursor: "pointer",
                      borderRadius: "4px 4px 0 0",
                    }}
                    onClick={() => setPreviewUrl(thumbs[rec.filename])}
                  />
                }
              >
                <Card.Meta
                  title={rec.filename}
                  description={new Date(rec.uploadedAt).toLocaleString()}
                />
                <div style={{ marginTop: 8 }}>
                  <img
                    src={thumbs[rec.outputName]}
                    alt={rec.outputName}
                    style={{
                      width: 50,
                      height: 50,
                      objectFit: "cover",
                      cursor: "pointer",
                      borderRadius: 4,
                      marginRight: 8,
                    }}
                    onClick={() => setPreviewUrl(thumbs[rec.outputName])}
                  />
                </div>
                <Tooltip title="View JSON">
                  <FileTextOutlined onClick={() => setPreviewJson(rec)} />
                </Tooltip>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        open={!!previewUrl}
        footer={null}
        onCancel={() => setPreviewUrl(null)}
        width="80%"
      >
        <img alt="preview" src={previewUrl} style={{ width: "100%" }} />
      </Modal>

      <Modal
        title="File JSON"
        open={!!previewJson}
        footer={null}
        onCancel={() => setPreviewJson(null)}
        width={600}
      >
        <pre style={{ maxHeight: 400, overflow: "auto" }}>
          {JSON.stringify(previewJson, null, 2)}
        </pre>
      </Modal>
    </>
  );
}
