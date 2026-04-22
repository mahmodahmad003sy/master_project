import React, { useEffect, useState } from "react";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  createBenchmark,
  deleteBenchmark,
  loadBenchmarks,
} from "../features/benchmarks/benchmarksSlice";
import { loadDocumentTypes } from "../features/documentTypes/documentTypesSlice";

export default function BenchmarksPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, status } = useSelector((state) => state.benchmarks);
  const { items: documentTypes } = useSelector((state) => state.documentTypes);
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(loadBenchmarks());
    dispatch(loadDocumentTypes());
  }, [dispatch]);

  const handleCreate = async () => {
    setSubmitting(true);

    try {
      const values = await form.validateFields();
      const created = await dispatch(createBenchmark(values)).unwrap();
      message.success("Benchmark created");
      setOpen(false);
      form.resetFields();
      navigate(`/benchmarks/${created.id}`);
    } catch (error) {
      if (typeof error === "string") {
        message.error(error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setOpen(true)}
        >
          New benchmark
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={status === "loading"}
        dataSource={items}
        onRow={(record) => ({
          onDoubleClick: () => navigate(`/benchmarks/${record.id}`),
        })}
        columns={[
          {
            title: "ID",
            dataIndex: "id",
            width: 80,
          },
          {
            title: "Name",
            dataIndex: "name",
          },
          {
            title: "Doc type",
            dataIndex: "documentType",
            width: 140,
            render: (value) => <Tag>{value}</Tag>,
          },
          {
            title: "Progress",
            width: 180,
            render: (_, record) =>
              `${record.doneItems + record.failedItems}/${record.totalItems}`,
          },
          {
            title: "Failed",
            dataIndex: "failedItems",
            width: 90,
          },
          {
            title: "Status",
            dataIndex: "status",
            width: 120,
            render: (value) => <Tag color={value === "done" ? "green" : "blue"}>{value}</Tag>,
          },
          {
            title: "Created",
            dataIndex: "createdAt",
            width: 200,
            render: (value) => new Date(value).toLocaleString(),
          },
          {
            title: "Actions",
            width: 180,
            render: (_, record) => (
              <Space>
                <Button onClick={() => navigate(`/benchmarks/${record.id}`)}>
                  Open
                </Button>
                <Popconfirm
                  title="Delete benchmark and all its runs?"
                  onConfirm={async () => {
                    try {
                      await dispatch(deleteBenchmark(record.id)).unwrap();
                      message.success("Benchmark deleted");
                    } catch (error) {
                      message.error(error);
                    }
                  }}
                >
                  <Button danger>Delete</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={open}
        title="New benchmark"
        destroyOnClose
        confirmLoading={submitting}
        onOk={handleCreate}
        onCancel={() => setOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="documentType"
            label="Document type"
            rules={[{ required: true, message: "Document type is required" }]}
          >
            <Select
              options={documentTypes.map((item) => ({
                value: item.key,
                label: item.name,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
