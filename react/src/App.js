// src/App.jsx
import React from "react";
import { Layout, Menu, Button } from "antd";
import {
  Link,
  Routes,
  Route,
  useLocation,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import ModelsPage from "./pages/ModelsPage";
import ResultsPage from "./pages/ResultsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ModelFilesPage from "./pages/ModelFilesPage";
import DetectTabsPage from "./pages/DetectTabsPage";
import RequireAuth from "./components/RequireAuth";
import { logout } from "./features/auth/authSlice";

const { Header, Content, Footer } = Layout;

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center" }}>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[pathname]}
          style={{ flex: 1 }}
        >
          <Menu.Item key="/upload">
            <Link to="/upload">Upload</Link>
          </Menu.Item>
          <Menu.Item key="/models">
            <Link to="/models">Models</Link>
          </Menu.Item>
          <Menu.Item key="/models-files">
            <Link to="/models-files">Model Files</Link>
          </Menu.Item>
        </Menu>

        {user && (
          <Button type="primary" onClick={handleLogout}>
            Logout
          </Button>
        )}
      </Header>

      <Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/*"
            element={
              <RequireAuth>
                <Routes>
                  <Route path="/upload" element={<DetectTabsPage />} />
                  <Route path="/models" element={<ModelsPage />} />
                  <Route path="/models-files" element={<ModelFilesPage />} />
                  <Route path="/results/:runId" element={<ResultsPage />} />
                  <Route path="/" element={<Navigate to="/upload" replace />} />
                  <Route path="*" element={<Navigate to="/upload" replace />} />
                </Routes>
              </RequireAuth>
            }
          />
        </Routes>
      </Content>

      <Footer style={{ textAlign: "center" }}>
        &copy; 2025 Extraction service
      </Footer>
    </Layout>
  );
}
