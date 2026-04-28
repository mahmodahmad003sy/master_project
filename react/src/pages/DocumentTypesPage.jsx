import React, { useEffect } from "react";
import {
  Button,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  activateDocumentType,
  deleteDocumentType,
  loadDocumentTypes,
  updateDocumentType,
} from "../features/documentTypes/documentTypesSlice";

const { Text, Title } = Typography;

function statusColor(status) {
  if (status === "active") return "green";
  if (status === "archived") return "orange";
  return "default";
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function DocumentTypesPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, status } = useSelector((state) => state.documentTypes);

  useEffect(() => {
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  const handleActivate = async (id) => {
    try {
      await dispatch(activateDocumentType(id)).unwrap();
      message.success("Document type activated");
    } catch (error) {
      message.error(String(error));
    }
  };

  const handleArchive = async (record) => {
    try {
      await dispatch(
        updateDocumentType({
          id: record.id,
          payload: { status: "archived" },
        })
      ).unwrap();
      message.success("Document type archived");
    } catch (error) {
      message.error(String(error));
    }
  };

  const handleDelete = async (record) => {
    try {
      await dispatch(deleteDocumentType(record.id)).unwrap();
      message.success("Document type deleted");
    } catch (error) {
      message.error(String(error));
    }
  };

  return (
    <div>
      <Space
        align="start"
        style={{
          width: "100%",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Document Types
          </Title>
          <Text type="secondary">
            Create, configure, attach detectors, and activate document schemas.
          </Text>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate("/document-types/new")}
        >
          New document type
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={status === "loading"}
        dataSource={items}
        columns={[
          {
            title: "Key",
            dataIndex: "key",
            width: 180,
            render: (value) => <Text code>{value}</Text>,
          },
          {
            title: "Name",
            dataIndex: "name",
          },
          {
            title: "Status",
            dataIndex: "status",
            width: 120,
            render: (value) => <Tag color={statusColor(value)}>{value}</Tag>,
          },
          {
            title: "Version",
            dataIndex: "version",
            width: 100,
            render: (value) => <Tag>v{value ?? 1}</Tag>,
          },
          {
            title: "Detector",
            dataIndex: "detectorModelId",
            width: 110,
            render: (value) => (value ? <Text code>{value}</Text> : "-"),
          },
          {
            title: "Updated",
            dataIndex: "updatedAt",
            width: 170,
            render: (value) => formatDateTime(value),
          },
          {
            title: "Actions",
            width: 320,
            render: (_, record) => (
              <Space>
                <Button onClick={() => navigate(`/document-types/${record.id}`)}>
                  Edit
                </Button>
                <Button
                  type="primary"
                  ghost
                  disabled={record.status === "active"}
                  onClick={() => handleActivate(record.id)}
                >
                  Activate
                </Button>
                <Popconfirm
                  title={`Archive "${record.name}"?`}
                  onConfirm={() => handleArchive(record)}
                  disabled={record.status === "archived"}
                >
                  <Button disabled={record.status === "archived"}>
                    Archive
                  </Button>
                </Popconfirm>
                {record.status === "active" ? (
                  <Tooltip title="Archive the document type before deleting it">
                    <Button danger icon={<DeleteOutlined />} disabled />
                  </Tooltip>
                ) : (
                  <Popconfirm
                    title={`Delete "${record.name}"?`}
                    description="Deletion is blocked if runs or attached models still exist."
                    onConfirm={() => handleDelete(record)}
                  >
                    <Button danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
