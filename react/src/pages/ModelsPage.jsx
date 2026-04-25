import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  createModel,
  deleteModel,
  fetchAllModels,
  updateModel,
  uploadDataset,
  uploadModelFile,
  validateModel,
} from "../features/models/modelsSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";

const { Option } = Select;
const { Text } = Typography;

function prettyBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = bytes;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const rounded = current >= 10 || unitIndex === 0 ? current.toFixed(0) : current.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function statusColor(status) {
  if (status === "validated") return "blue";
  if (status === "active") return "green";
  if (status === "archived") return "orange";
  return "default";
}

function truncateHash(hash) {
  if (!hash) return "-";
  return hash.slice(0, 8);
}

export default function ModelsPage() {
  const dispatch = useDispatch();
  const { models, status } = useSelector((state) => state.models);
  const documentTypes = useSelector((state) => state.documentTypes.items);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const [uploadingModel, setUploadingModel] = useState(null);
  const [uploadType, setUploadType] = useState(null);
  const [uploadFileList, setUploadFileList] = useState([]);

  useEffect(() => {
    dispatch(fetchAllModels());
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  const documentTypeNameById = useMemo(
    () =>
      Object.fromEntries(documentTypes.map((item) => [item.id, item.name])),
    [documentTypes]
  );

  const openCrudModal = (model = null) => {
    setEditing(model);
    form.setFieldsValue(
      model || {
        name: "",
        type: "yolo",
        family: "yolo",
        classesCount: undefined,
        version: 1,
        notes: "",
      }
    );
    setIsModalVisible(true);
  };

  const handleCrudOk = () => {
    form
      .validateFields()
      .then((values) => {
        const payload = {
          ...values,
          notes: values.notes || undefined,
        };
        const action = editing
          ? updateModel({ id: editing.id, payload })
          : createModel(payload);

        dispatch(action)
          .unwrap()
          .then(() => {
            message.success(editing ? "Model updated" : "Model created");
            setIsModalVisible(false);
            form.resetFields();
          })
          .catch((error) => {
            message.error(String(error));
          });
      })
      .catch(() => {});
  };

  const confirmDelete = (model) => {
    if (model.status === "active") {
      return;
    }

    Modal.confirm({
      title: `Delete model "${model.name}"?`,
      onOk: () =>
        dispatch(deleteModel(model.id))
          .unwrap()
          .then(() => message.success("Model deleted"))
          .catch((error) => message.error(String(error))),
    });
  };

  const openUploadModal = (model, type) => {
    setUploadingModel(model);
    setUploadType(type);
    setUploadFileList([]);
  };

  const handleUploadOk = () => {
    if (!uploadFileList.length) {
      message.warning("Please select a file");
      return;
    }

    const fileItem = uploadFileList[0];
    const file = fileItem.originFileObj || fileItem;
    if (!(file instanceof File)) {
      message.error("Upload failed: no valid file found");
      return;
    }

    const thunk =
      uploadType === "dataset"
        ? uploadDataset({ modelId: uploadingModel.id, file })
        : uploadModelFile({ modelId: uploadingModel.id, file });

    dispatch(thunk)
      .unwrap()
      .then((payload) => {
        if (uploadType === "dataset") {
          message.success(`Dataset stored at ${payload.data.datasetPath}`);
        } else {
          message.success("Model weights uploaded");
          dispatch(fetchAllModels());
        }
        setUploadingModel(null);
        setUploadType(null);
        setUploadFileList([]);
      })
      .catch((error) => message.error(String(error)));
  };

  const handleValidate = async (model) => {
    try {
      await dispatch(validateModel(model.id)).unwrap();
      message.success("Model validated");
    } catch (error) {
      message.error(String(error));
    }
  };

  const commonUploadProps = {
    accept: uploadType === "dataset" ? ".rar" : ".pt",
    fileList: uploadFileList,
    beforeUpload: (file) => {
      setUploadFileList([file]);
      return false;
    },
    onRemove: () => setUploadFileList([]),
    listType: "text",
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      width: 72,
      render: (value) => <Text code>{value}</Text>,
    },
    {
      title: "Name",
      dataIndex: "name",
    },
    {
      title: "Family",
      dataIndex: "family",
      width: 110,
      render: (value) => <Tag>{value || "-"}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (value) => <Tag color={statusColor(value)}>{value || "uploaded"}</Tag>,
    },
    {
      title: "Version",
      dataIndex: "version",
      width: 90,
      render: (value) => <Tag>v{value ?? 1}</Tag>,
    },
    {
      title: "Document Type",
      dataIndex: "documentTypeId",
      width: 180,
      render: (value) =>
        value ? (
          <Link to={`/document-types/${value}`}>
            {documentTypeNameById[value] || `#${value}`}
          </Link>
        ) : (
          "-"
        ),
    },
    {
      title: "Classes",
      dataIndex: "classesCount",
      width: 90,
      render: (value) => value ?? "-",
    },
    {
      title: "File Size",
      dataIndex: "fileSize",
      width: 110,
      render: (value) => prettyBytes(value),
    },
    {
      title: "SHA256",
      dataIndex: "sha256",
      width: 110,
      render: (value) =>
        value ? (
          <Tooltip title={value}>
            <Text code>{truncateHash(value)}...</Text>
          </Tooltip>
        ) : (
          "-"
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 300,
      render: (_, record) => (
        <Space wrap size="small">
          <Button
            size="small"
            icon={<FileDoneOutlined />}
            onClick={() => openUploadModal(record, "modelFile")}
          >
            Upload .pt
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openCrudModal(record)}
          >
            Edit
          </Button>
          {record.status === "uploaded" ? (
            <Button size="small" onClick={() => handleValidate(record)}>
              Validate
            </Button>
          ) : null}
          {record.status === "active" ? (
            <Tooltip title="Cannot delete an active model">
              <Button size="small" danger icon={<DeleteOutlined />} disabled />
            </Tooltip>
          ) : (
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => confirmDelete(record)}
            />
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space
        align="start"
        style={{
          width: "100%",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            Models
          </Typography.Title>
          <Typography.Text type="secondary">
            Detector registry with version, status, binding, and file metadata.
          </Typography.Text>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openCrudModal()}
        >
          New model
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={status === "loading"}
        dataSource={models}
        columns={columns}
      />

      <Modal
        title={editing ? "Edit Model" : "New Model"}
        open={isModalVisible}
        onOk={handleCrudOk}
        onCancel={() => setIsModalVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter a name" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select placeholder="Select type">
              <Option value="yolo">YOLO</Option>
              <Option value="frcnn">FRCNN</Option>
            </Select>
          </Form.Item>
          <Form.Item name="family" label="Family">
            <Select placeholder="Select family">
              <Option value="yolo">YOLO</Option>
            </Select>
          </Form.Item>
          <Form.Item name="classesCount" label="Classes count">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="version" label="Version">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          uploadingModel
            ? uploadType === "dataset"
              ? `Upload Dataset for ${uploadingModel.name}`
              : `Upload Model File for ${uploadingModel.name}`
            : ""
        }
        open={!!uploadingModel}
        onOk={handleUploadOk}
        onCancel={() => setUploadingModel(null)}
        okText="Upload"
      >
        <Upload {...commonUploadProps}>
          <Button icon={<UploadOutlined />}>
            {uploadType === "dataset" ? "Select .rar" : "Select .pt"}
          </Button>
        </Upload>
      </Modal>
    </>
  );
}
