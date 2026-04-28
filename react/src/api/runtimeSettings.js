import client from "./client";

export const fetchRuntimeSettingsApi = () => client.get("/settings/runtime");

export const updateRuntimeSettingsApi = (settings) =>
  client.put("/settings/runtime", settings);
