import client from "./client";

export const listBenchmarksApi = () => client.get("/benchmarks");

export const createBenchmarkApi = (payload) => client.post("/benchmarks", payload);

export const getBenchmarkApi = (id) => client.get(`/benchmarks/${id}`);

export const deleteBenchmarkApi = (id) => client.delete(`/benchmarks/${id}`);

export const uploadBenchmarkZipApi = (id, zipFile, onProgress) => {
  const form = new FormData();
  form.append("zip", zipFile);

  return client.post(`/benchmarks/${id}/items`, form, {
    timeout: 300_000,
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(evt.loaded / evt.total);
      }
    },
  });
};

export const startBenchmarkApi = (id) => client.post(`/benchmarks/${id}/run`);

export const downloadBenchmarkCsvApi = (id) =>
  client.get(`/benchmarks/${id}/export/csv`, { responseType: "blob" });
