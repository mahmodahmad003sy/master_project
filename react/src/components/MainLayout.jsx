import React from "react";
import { Layout, Typography } from "antd";
const { Header, Content, Footer } = Layout;

export default function MainLayout({ children }) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529" }}>
        <Typography.Title level={2} style={{ color: "#fff", margin: 0 }}>
          Object Detection Dashboard
        </Typography.Title>
      </Header>
      <Content style={{ padding: 24 }}>{children}</Content>
      <Footer style={{ textAlign: "center" }}>
        &copy; 2025 Extraction service
      </Footer>
    </Layout>
  );
}
