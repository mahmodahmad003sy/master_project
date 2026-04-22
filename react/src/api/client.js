import axios from "axios";
import Swal from "sweetalert2";

// ——— your existing client setup ———
const client = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:3000",
  timeout: 30_000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// — intercept all errors, fire a logout event on 401
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401) {
      // let whoever is listening know we need to log out
      window.dispatchEvent(new Event("logout"));
    } else {
      const msg = err.response?.data?.message || err.message;
    }

    return Promise.reject(err);
  }
);

export default client;
