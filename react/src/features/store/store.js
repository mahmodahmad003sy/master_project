import { configureStore } from "@reduxjs/toolkit";
import authReducer, { logout } from "../auth/authSlice";
import modelsReducer from "../models/modelsSlice";
import modelFilesReducer from "../modelFiles/modelFilesSlice";
import client from "../../api/client";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    models: modelsReducer,
    modelFiles: modelFilesReducer,
  },
});

// auto-logout on 401
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      store.dispatch(logout());
    }
    return Promise.reject(err);
  }
);
