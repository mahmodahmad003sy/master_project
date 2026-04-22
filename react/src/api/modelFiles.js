// src/api/models.js
import client from "./client";

/**
 * Fetch all models.
 */
export const fetchModels = () => client.get("/models");

/**
 * Create a new model.
 */
export const createModelApi = (payload) => client.post("/models", payload);

/**
 * Update an existing model.
 */
export const updateModelApi = (id, payload) =>
  client.put(`/models/${id}`, payload);

/**
 * Delete a model.
 */
export const deleteModelApi = (id) => client.delete(`/models/${id}`);

/**
 * Upload a dataset file for a given model.
 */
export const uploadDatasetApi = (id, file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`/models/${id}/dataset`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/**
 * Upload a model file (weights) for a given model.
 */
export const uploadModelFileApi = (id, file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`/models/${id}/files`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/**
 * Fetch a paginated, filterable list of ModelFiles.
 *
 * @param {Object} options
 * @param {string} [options.search]
 * @param {number} [options.modelId]
 * @param {string} [options.dateFrom]
 * @param {string} [options.dateTo]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 */
export async function fetchModelFilesApi(options) {
  console.log("some other called");

  const { data } = await client.get("/model-files", { params: options });
  return data; // { items: [...], total: N }
}
