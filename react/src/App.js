import React from "react";
import { Button, Layout, Menu } from "antd";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import RequireAuth from "./components/RequireAuth";
import { logout } from "./features/auth/authSlice";
import ComparePage from "./pages/ComparePage";
import BenchmarkDetailPage from "./pages/BenchmarkDetailPage";
import BenchmarksPage from "./pages/BenchmarksPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import LoginPage from "./pages/LoginPage";
import ModelsPage from "./pages/ModelsPage";
import PresentationPage from "./pages/PresentationPage";
import RegisterPage from "./pages/RegisterPage";
import RunDetailPage from "./pages/RunDetailPage";
import RunsPage from "./pages/RunsPage";

const { Content, Footer, Header } = Layout;

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };
  const isPresentation = pathname.startsWith("/demo/");

  const selectedKey = pathname.startsWith("/runs/")
    ? "/runs"
    : pathname.startsWith("/benchmarks/")
      ? "/benchmarks"
    : pathname.startsWith("/analytics/")
      ? "/analytics"
    : pathname;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {!isPresentation ? (
        <Header style={{ display: "flex", alignItems: "center" }}>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedKey]}
            style={{ flex: 1 }}
          >
            <Menu.Item key="/compare">
              <Link to="/compare">Compare</Link>
            </Menu.Item>
            <Menu.Item key="/runs">
              <Link to="/runs">Runs</Link>
            </Menu.Item>
            <Menu.Item key="/benchmarks">
              <Link to="/benchmarks">Benchmarks</Link>
            </Menu.Item>
            <Menu.Item key="/analytics">
              <Link to="/analytics">Analytics</Link>
            </Menu.Item>
            <Menu.Item key="/models">
              <Link to="/models">Models</Link>
            </Menu.Item>
          </Menu>

          {user ? (
            <Button type="primary" onClick={handleLogout}>
              Logout
            </Button>
          ) : null}
        </Header>
      ) : null}

      <Content style={isPresentation ? undefined : { padding: 24 }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/demo/:id" element={<PresentationPage />} />

          <Route
            path="/*"
            element={
              <RequireAuth>
                <Routes>
                  <Route path="/compare" element={<ComparePage />} />
                  <Route path="/runs" element={<RunsPage />} />
                  <Route path="/runs/:id" element={<RunDetailPage />} />
                  <Route path="/benchmarks" element={<BenchmarksPage />} />
                  <Route
                    path="/benchmarks/:id"
                    element={<BenchmarkDetailPage />}
                  />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/models" element={<ModelsPage />} />
                  <Route path="/" element={<Navigate to="/compare" replace />} />
                  <Route path="*" element={<Navigate to="/compare" replace />} />
                </Routes>
              </RequireAuth>
            }
          />
        </Routes>
      </Content>

      {!isPresentation ? (
        <Footer style={{ textAlign: "center" }}>
          &copy; 2025 Extraction service
        </Footer>
      ) : null}
    </Layout>
  );
}
