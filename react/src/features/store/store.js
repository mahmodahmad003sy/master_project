import { configureStore } from "@reduxjs/toolkit";
import client from "../../api/client";
import authReducer, { logout } from "../auth/authSlice";
import comparisonReducer from "../comparison/comparisonSlice";
import documentTypesReducer from "../documentTypes/documentTypesSlice";
import modelFilesReducer from "../modelFiles/modelFilesSlice";
import modelsReducer from "../models/modelsSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    models: modelsReducer,
    modelFiles: modelFilesReducer,
    comparison: comparisonReducer,
    documentTypes: documentTypesReducer,
  },
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      store.dispatch(logout());
    }
    return Promise.reject(err);
  }
);
