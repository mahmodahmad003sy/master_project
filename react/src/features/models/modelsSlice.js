import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  fetchModels,
  createModelApi,
  updateModelApi,
  deleteModelApi,
  uploadDatasetApi,
  uploadModelFileApi,
  validateModelApi,
} from "../../api/models";

export const fetchAllModels = createAsyncThunk(
  "models/fetchAll",
  async (_, { rejectWithValue }) => {
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

export const validateModel = createAsyncThunk(
  "models/validate",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await validateModelApi(id);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "validate failed");
    }
  }
);

const initialState = {
  models: [],
  selectedModelId: null,
  status: "idle",
  error: null,
};

function replaceModel(models, nextModel) {
  return models.map((model) => (model.id === nextModel.id ? nextModel : model));
}

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
      .addCase(fetchAllModels.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAllModels.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.models = action.payload;
        if (!state.selectedModelId && action.payload.length) {
          state.selectedModelId = action.payload[0].id;
        }
      })
      .addCase(fetchAllModels.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload;
      })
      .addCase(createModel.fulfilled, (state, action) => {
        state.models.push(action.payload);
        state.selectedModelId = action.payload.id;
      })
      .addCase(updateModel.fulfilled, (state, action) => {
        state.models = replaceModel(state.models, action.payload);
      })
      .addCase(deleteModel.fulfilled, (state, action) => {
        state.models = state.models.filter((model) => model.id !== action.payload);
        if (state.selectedModelId === action.payload) {
          state.selectedModelId = state.models[0]?.id || null;
        }
      })
      .addCase(uploadModelFile.fulfilled, (state, action) => {
        state.models = replaceModel(state.models, action.payload.data);
      })
      .addCase(validateModel.fulfilled, (state, action) => {
        state.models = replaceModel(state.models, action.payload);
      });
  },
});

export const { setSelectedModelId } = modelsSlice.actions;
export default modelsSlice.reducer;
