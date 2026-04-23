import client from "./client";

export const fetchAnalyticsSummaryApi = (params = {}) =>
  client.get("/analytics/summary", { params });
