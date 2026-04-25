import client from "./client";

export const fetchAll = () => client.get("/document-types");

export const fetchOne = (id) => client.get(`/document-types/${id}`);

export const create = (payload) => client.post("/document-types", payload);

export const update = (id, payload) =>
  client.put(`/document-types/${id}`, payload);

export const activate = (id) => client.post(`/document-types/${id}/activate`);

export const attachDetector = (id, modelId) =>
  client.post(`/document-types/${id}/detector-model`, { modelId });

export const listModels = (id) => client.get(`/document-types/${id}/models`);
