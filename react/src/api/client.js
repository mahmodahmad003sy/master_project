import axios from "axios";

function fallbackBaseUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api`;
  }

  return "http://localhost:3000/api";
}

function normalizeBaseUrl(rawBaseUrl) {
  const trimmed = (rawBaseUrl || fallbackBaseUrl()).replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export const API_BASE_URL = normalizeBaseUrl(process.env.REACT_APP_API_URL);

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.dispatchEvent(new Event("logout"));
    }

    return Promise.reject(err);
  }
);

export default client;
