import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as api from "../../api/documentTypes";

export const loadDocumentTypes = createAsyncThunk(
  "documentTypes/load",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.fetchAll();
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || error.response?.data?.message || error.message
      );
    }
  }
);

export const createDocumentType = createAsyncThunk(
  "documentTypes/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.create(payload);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "create failed"
      );
    }
  }
);

export const updateDocumentType = createAsyncThunk(
  "documentTypes/update",
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { data } = await api.update(id, payload);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "update failed"
      );
    }
  }
);

export const activateDocumentType = createAsyncThunk(
  "documentTypes/activate",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.activate(id);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "activation failed"
      );
    }
  }
);

export const deleteDocumentType = createAsyncThunk(
  "documentTypes/delete",
  async (id, { rejectWithValue }) => {
    try {
      await api.remove(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "delete failed"
      );
    }
  }
);

export const attachDetector = createAsyncThunk(
  "documentTypes/attachDetector",
  async ({ id, modelId }, { rejectWithValue }) => {
    try {
      const { data } = await api.attachDetector(id, modelId);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "attach failed"
      );
    }
  }
);

function upsertItem(items, nextItem) {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id);
  if (existingIndex === -1) {
    items.push(nextItem);
    return;
  }

  items[existingIndex] = nextItem;
}

const documentTypesSlice = createSlice({
  name: "documentTypes",
  initialState: {
    items: [],
    status: "idle",
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadDocumentTypes.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadDocumentTypes.fulfilled, (state, action) => {
        state.status = "ok";
        state.items = action.payload;
      })
      .addCase(loadDocumentTypes.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      })
      .addCase(createDocumentType.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(createDocumentType.fulfilled, (state, action) => {
        state.status = "ok";
        upsertItem(state.items, action.payload);
      })
      .addCase(createDocumentType.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      })
      .addCase(updateDocumentType.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(updateDocumentType.fulfilled, (state, action) => {
        state.status = "ok";
        upsertItem(state.items, action.payload);
      })
      .addCase(updateDocumentType.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      })
      .addCase(activateDocumentType.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(activateDocumentType.fulfilled, (state, action) => {
        state.status = "ok";
        upsertItem(state.items, action.payload);
      })
      .addCase(activateDocumentType.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      })
      .addCase(attachDetector.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(attachDetector.fulfilled, (state, action) => {
        state.status = "ok";
        upsertItem(state.items, action.payload);
      })
      .addCase(attachDetector.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      })
      .addCase(deleteDocumentType.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(deleteDocumentType.fulfilled, (state, action) => {
        state.status = "ok";
        state.items = state.items.filter((item) => item.id !== action.payload);
      })
      .addCase(deleteDocumentType.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      });
  },
});

export default documentTypesSlice.reducer;
