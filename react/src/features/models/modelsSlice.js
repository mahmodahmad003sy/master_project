import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  fetchModels,
  createModelApi,
  updateModelApi,
  deleteModelApi,
  uploadDatasetApi,
  uploadModelFileApi,
} from "../../api/models";

export const fetchAllModels = createAsyncThunk(
  "models/fetchAll",
  async (_, { rejectWithValue }) => {
    console.log("dipatched");

    try {
      const res = await fetchModels();
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const createModel = createAsyncThunk(
  "models/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await createModelApi(payload);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateModel = createAsyncThunk(
  "models/update",
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { data } = await updateModelApi(id, payload);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const deleteModel = createAsyncThunk(
  "models/delete",
  async (id, { rejectWithValue }) => {
    try {
      await deleteModelApi(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// (optional) dataset & file uploads
export const uploadDataset = createAsyncThunk(
  "models/uploadDataset",
  async ({ modelId, file }, { rejectWithValue }) => {
    try {
      const { data } = await uploadDatasetApi(modelId, file);
      return { modelId, data };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const uploadModelFile = createAsyncThunk(
  "models/uploadFile",
  async ({ modelId, file }, { rejectWithValue }) => {
    try {
      const { data } = await uploadModelFileApi(modelId, file);
      return { modelId, data };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const initialState = {
  models: [],
  selectedModelId: null,
  status: "idle",
  error: null,
};

const modelsSlice = createSlice({
  name: "models",
  initialState,
  reducers: {
    setSelectedModelId(state, action) {
      state.selectedModelId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchAll
      .addCase(fetchAllModels.pending, (s) => {
        s.status = "loading";
        s.error = null;
      })
      .addCase(fetchAllModels.fulfilled, (s, a) => {
        s.status = "succeeded";
        s.models = a.payload;
        if (!s.selectedModelId && a.payload.length) {
          s.selectedModelId = a.payload[0].id;
        }
      })
      .addCase(fetchAllModels.rejected, (s, a) => {
        s.status = "failed";
        s.error = a.payload;
      })
      // create
      .addCase(createModel.fulfilled, (s, a) => {
        s.models.push(a.payload);
        s.selectedModelId = a.payload.id;
      })
      // update
      .addCase(updateModel.fulfilled, (s, a) => {
        s.models = s.models.map((m) => (m.id === a.payload.id ? a.payload : m));
      })
      // delete
      .addCase(deleteModel.fulfilled, (s, a) => {
        s.models = s.models.filter((m) => m.id !== a.payload);
        if (s.selectedModelId === a.payload) {
          s.selectedModelId = s.models[0]?.id || null;
        }
      });
  },
});

export const { setSelectedModelId } = modelsSlice.actions;
export default modelsSlice.reducer;
