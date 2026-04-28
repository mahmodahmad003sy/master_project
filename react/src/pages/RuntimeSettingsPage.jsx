import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  fetchRuntimeSettingsApi,
  updateRuntimeSettingsApi,
} from "../api/runtimeSettings";

const { Paragraph, Text, Title } = Typography;

function findItem(items, key) {
  return items.find((item) => item.key === key) || null;
}

export default function RuntimeSettingsPage() {
  const [items, setItems] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState(null);

  const loadItems = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await fetchRuntimeSettingsApi();
      const nextItems = data.items || [];
      setItems(nextItems);
      setValues(
        Object.fromEntries(nextItems.map((item) => [item.key, item.value || ""]))
      );
    } catch (loadError) {
      setError(
        loadError.response?.data?.message ||
          loadError.response?.data?.error ||
          loadError.message
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const orderedItems = useMemo(
    () => [
      findItem(items, "COMPARE_SERVICE_URL"),
      findItem(items, "PUBLIC_API_URL"),
      findItem(items, "COLAB_SYNC_TOKEN"),
    ].filter(Boolean),
    [items]
  );

  const persistSetting = async (key, value) => {
    setSavingKey(key);
    setError(null);

    try {
      const { data } = await updateRuntimeSettingsApi({ [key]: value });
      const nextItems = data.items || [];
      setItems(nextItems);
      setValues(
        Object.fromEntries(nextItems.map((item) => [item.key, item.value || ""]))
      );
      message.success(
        value == null ? "Runtime setting reset to default" : "Runtime setting updated"
      );
    } catch (saveError) {
      setError(
        saveError.response?.data?.message ||
          saveError.response?.data?.error ||
          saveError.message
      );
    } finally {
      setSavingKey(null);
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
            Runtime Settings
          </Title>
          <Text type="secondary">
            Changes are stored in the database and apply to new compare and sync requests without a restart.
          </Text>
        </div>

        <Button onClick={loadItems} loading={loading}>
          Reload
        </Button>
      </Space>

      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={String(error)}
        />
      ) : null}

      <Card loading={loading}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="Saving here overrides the environment/default config. Reset removes the DB override."
          />

          {orderedItems.map((item) => (
            <Card
              key={item.key}
              size="small"
              title={item.label}
              extra={item.isOverride ? <Tag color="blue">DB override</Tag> : <Tag>Default</Tag>}
            >
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {item.description}
                </Paragraph>

                {item.secret ? (
                  <Input.Password
                    value={values[item.key] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [item.key]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    value={values[item.key] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [item.key]: event.target.value,
                      }))
                    }
                  />
                )}

                <Text type="secondary">
                  Default: <Text code>{item.defaultValue || "(empty)"}</Text>
                </Text>

                <Space>
                  <Button
                    type="primary"
                    loading={savingKey === item.key}
                    onClick={() => persistSetting(item.key, values[item.key] ?? "")}
                  >
                    Save
                  </Button>
                  <Button
                    loading={savingKey === item.key}
                    onClick={() => persistSetting(item.key, null)}
                  >
                    Reset to default
                  </Button>
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      </Card>
    </div>
  );
}
