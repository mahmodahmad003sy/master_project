import client, { API_BASE_URL } from "./client";

export const fetchDocumentTypes = () => client.get("/document-types");

export const runCompareApi = (file, documentTypeKey, onProgress) => {
  const form = new FormData();
  form.append("file", file);
  form.append("documentType", documentTypeKey);

  return client.post("/compare", form, {
    timeout: 300_000,
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(evt.loaded / evt.total);
      }
    },
  });
};

export const fetchRun = (id) => client.get(`/runs/${id}`);

export const listRunsApi = (params = {}) => client.get("/runs", { params });

export const deleteRunApi = (id) => client.delete(`/runs/${id}`);

export const putGroundTruthApi = (id, groundTruth) =>
  client.put(`/runs/${id}/ground-truth`, groundTruth);

export const deleteGroundTruthApi = (id) =>
  client.delete(`/runs/${id}/ground-truth`);

export const fetchRunImageBlob = (id) =>
  client.get(`/runs/${id}/image`, { responseType: "blob" });

export const runImageUrl = (id) => `${API_BASE_URL}/runs/${id}/image`;
