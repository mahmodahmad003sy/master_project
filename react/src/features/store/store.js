import { configureStore } from "@reduxjs/toolkit";
import client from "../../api/client";
import analyticsReducer from "../analytics/analyticsSlice";
import authReducer, { logout } from "../auth/authSlice";
import benchmarksReducer from "../benchmarks/benchmarksSlice";
import comparisonReducer from "../comparison/comparisonSlice";
import documentTypesReducer from "../documentTypes/documentTypesSlice";
import modelsReducer from "../models/modelsSlice";
import runsReducer from "../runs/runsSlice";

export const store = configureStore({
  reducer: {
    analytics: analyticsReducer,
    auth: authReducer,
    models: modelsReducer,
    comparison: comparisonReducer,
    documentTypes: documentTypesReducer,
    runs: runsReducer,
    benchmarks: benchmarksReducer,
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
