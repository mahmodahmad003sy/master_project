// src/pages/RegisterPage.jsx
import React from "react";
import { Form, Input, Button, Card, message } from "antd";
import { useDispatch } from "react-redux";
import { register } from "../features/auth/authSlice";
import { useNavigate } from "react-router-dom";

export default function RegisterPage() {
  const dispatch = useDispatch();
  const nav = useNavigate();

  const onFinish = (vals) => {
    dispatch(register(vals))
      .unwrap()
      .then(() => {
        nav("/compare");
      })
      .catch((errMsg) => {
        message.error(errMsg);
      });
  };

  return (
    <Card
      title="Register"
      style={{ maxWidth: 400, margin: "auto", marginTop: 100 }}
    >
      <Form onFinish={onFinish} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true }]}
        >
          <Input.Password />
        </Form.Item>
        <Button htmlType="submit" type="primary" block>
          Register
        </Button>
      </Form>
    </Card>
  );
}
