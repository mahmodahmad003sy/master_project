// src/pages/ModelsPage.jsx
import React, { useState, useEffect } from "react";
import {
  List,
  Card,
  Button,
  Modal,
  Form,
  Input,
  Dropdown,
  message,
  Select,
  Upload,
} from "antd";
import {
  PlusOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  FileDoneOutlined,
} from "@ant-design/icons";
import { useSelector, useDispatch } from "react-redux";
import {
  fetchAllModels,
  createModel,
  updateModel,
  deleteModel,
  uploadDataset,
  uploadModelFile,
  setSelectedModelId,
} from "../features/models/modelsSlice";

const { Option } = Select;

export default function ModelsPage() {
  const dispatch = useDispatch();
  const models = useSelector((state) => state.models.models);
  const selectedModelId = useSelector((state) => state.models.selectedModelId);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const [uploadingModel, setUploadingModel] = useState(null);
  const [uploadType, setUploadType] = useState(null);
  const [uploadFileList, setUploadFileList] = useState([]);

  useEffect(() => {
    dispatch(fetchAllModels());
  }, [dispatch]);

  const openCrudModal = (model = null) => {
    setEditing(model);
    form.setFieldsValue(model || { name: "", type: undefined });
    setIsModalVisible(true);
  };

  const handleCrudOk = () => {
    form
      .validateFields()
      .then((vals) => {
        const action = editing
          ? updateModel({ id: editing.id, payload: vals })
          : createModel(vals);
        dispatch(action)
          .unwrap()
          .then(() => {
            message.success(editing ? "Model updated" : "Model created");
            setIsModalVisible(false);
          });
      })
      .catch(() => {});
  };

  const confirmDelete = (m) => {
    Modal.confirm({
      title: `Delete model "${m.name}"?`,
      onOk: () =>
        dispatch(deleteModel(m.id))
          .unwrap()
          .then(() => message.success("Model deleted")),
    });
  };

  const openUploadModal = (m, type) => {
    setUploadingModel(m);
    setUploadType(type);
    setUploadFileList([]);
  };

  const handleUploadOk = () => {
    if (!uploadFileList.length) {
      return message.warning("Please select a file");
    }
    const fileItem = uploadFileList[0];
    const file = fileItem.originFileObj || fileItem;
    if (!(file instanceof File)) {
      return message.error("Upload failed: no valid file found");
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
        }
        setUploadingModel(null);
        setUploadType(null);
      })
      .catch(() => message.error("Upload failed"));
  };

  const commonUploadProps = {
    accept: uploadType === "dataset" ? ".rar" : undefined,
    fileList: uploadFileList,
    beforeUpload: (f) => {
      setUploadFileList([f]);
      return false;
    },
    onRemove: () => setUploadFileList([]),
    listType: "text",
  };

  return (
    <>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => openCrudModal()}
        style={{ marginBottom: 16 }}
      >
        New Model
      </Button>

      <List
        grid={{ gutter: 16, column: 3 }}
        dataSource={models}
        renderItem={(m) => (
          <List.Item>
            <Card
              title={m.name}
              hoverable
              onClick={() => dispatch(setSelectedModelId(m.id))}
              style={{
                border:
                  m.id === selectedModelId ? "2px solid #1890ff" : undefined,
              }}
              extra={
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: "uploadDataset",
                        icon: <UploadOutlined />,
                        label: "Upload Dataset",
                      },
                      {
                        key: "uploadModelFile",
                        icon: <FileDoneOutlined />,
                        label: "Upload Model File",
                      },
                      { type: "divider" },
                      { key: "edit", icon: <EditOutlined />, label: "Edit" },
                      {
                        key: "delete",
                        icon: <DeleteOutlined />,
                        label: "Delete",
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === "uploadDataset") return openUploadModal(m, "dataset");
                      if (key === "uploadModelFile") return openUploadModal(m, "modelFile");
                      if (key === "edit") return openCrudModal(m);
                      if (key === "delete") return confirmDelete(m);
                    },
                  }}
                >
                  <MoreOutlined />
                </Dropdown>
              }
            >
              Type: {m.type.toUpperCase()}
            </Card>
          </List.Item>
        )}
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
            {uploadType === "dataset" ? "Select .rar" : "Select File"}
          </Button>
        </Upload>
      </Modal>
    </>
  );
}
