// src/api/models.js
import client from "./client";

/**
 * Fetch all models.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const fetchModels = () => client.get("/models");

/**
 * Create a new model.
 * @param {{ name: string, type: string }} payload
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const createModelApi = (payload) => client.post("/models", payload);

/**
 * Update an existing model.
 * @param {number} id
 * @param {{ name?: string, type?: string }} payload
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const updateModelApi = (id, payload) =>
  client.put(`/models/${id}`, payload);

/**
 * Delete a model.
 * @param {number} id
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const deleteModelApi = (id) => client.delete(`/models/${id}`);

/**
 * Upload a dataset file for a given model.
 * @param {number} id
 * @param {File} file
 * @returns {Promise<import('axios').AxiosResponse>}
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
 * @param {number} id
 * @param {File} file
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const uploadModelFileApi = (id, file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post(`/models/${id}/files`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
