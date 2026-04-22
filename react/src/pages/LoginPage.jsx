// src/pages/LoginPage.jsx
import React from "react";
import { Form, Input, Button, Card, message } from "antd";
import { useDispatch } from "react-redux";
import { login } from "../features/auth/authSlice";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const dispatch = useDispatch();
  const nav = useNavigate();

  const onFinish = (vals) => {
    dispatch(login(vals))
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
      title="Login"
      style={{ maxWidth: 400, margin: "auto", marginTop: 100 }}
    >
      <Form onFinish={onFinish} layout="vertical">
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
          Login
        </Button>
      </Form>
    </Card>
  );
}
