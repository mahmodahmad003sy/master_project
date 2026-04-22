import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  deleteGroundTruthApi,
  deleteRunApi,
  fetchRun,
  listRunsApi,
  putGroundTruthApi,
} from "../../api/compare";

export const loadRuns = createAsyncThunk(
  "runs/load",
  async (_, { getState, rejectWithValue }) => {
    const { filters, pagination } = getState().runs;
    const params = {
      limit: pagination.pageSize,
      offset: (pagination.current - 1) * pagination.pageSize,
      ...filters,
    };

    try {
      const { data } = await listRunsApi(params);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);

export const loadRunDetail = createAsyncThunk(
  "runs/loadDetail",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await fetchRun(id);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);

export const deleteRun = createAsyncThunk(
  "runs/delete",
  async (id, { rejectWithValue }) => {
    try {
      await deleteRunApi(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);

export const saveGroundTruth = createAsyncThunk(
  "runs/saveGroundTruth",
  async ({ id, groundTruth }, { rejectWithValue }) => {
    try {
      const { data } = await putGroundTruthApi(id, groundTruth);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);

export const clearGroundTruth = createAsyncThunk(
  "runs/clearGroundTruth",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await deleteGroundTruthApi(id);
      return data.run;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message
      );
    }
  }
);

const runsSlice = createSlice({
  name: "runs",
  initialState: {
    items: [],
    total: 0,
    status: "idle",
    error: null,
    filters: {
      search: undefined,
      documentType: undefined,
      hasGroundTruth: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    },
    pagination: {
      current: 1,
      pageSize: 20,
    },
    detail: null,
    detailStatus: "idle",
    detailError: null,
  },
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setPagination(state, action) {
      state.pagination = { ...state.pagination, ...action.payload };
    },
    clearDetail(state) {
      state.detail = null;
      state.detailStatus = "idle";
      state.detailError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadRuns.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadRuns.fulfilled, (state, action) => {
        state.status = "ok";
        state.items = action.payload.items;
        state.total = action.payload.total;
      })
      .addCase(loadRuns.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      })
      .addCase(loadRunDetail.pending, (state) => {
        state.detailStatus = "loading";
        state.detailError = null;
      })
      .addCase(loadRunDetail.fulfilled, (state, action) => {
        state.detailStatus = "ok";
        state.detail = action.payload;
      })
      .addCase(loadRunDetail.rejected, (state, action) => {
        state.detailStatus = "fail";
        state.detailError = action.payload;
      })
      .addCase(deleteRun.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
        state.total = Math.max(0, state.total - 1);
      })
      .addCase(saveGroundTruth.fulfilled, (state, action) => {
        if (state.detail && state.detail.run.id === action.payload.run.id) {
          state.detail.run = action.payload.run;
          state.detail.artifacts.groundTruth = action.payload.groundTruth;
          state.detail.artifacts.metrics = action.payload.metrics;
        }

        const index = state.items.findIndex((item) => item.id === action.payload.run.id);
        if (index >= 0) {
          state.items[index] = action.payload.run;
        }
      })
      .addCase(clearGroundTruth.fulfilled, (state, action) => {
        if (state.detail && state.detail.run.id === action.payload.id) {
          state.detail.run = action.payload;
          state.detail.artifacts.groundTruth = null;
          state.detail.artifacts.metrics = null;
        }

        const index = state.items.findIndex((item) => item.id === action.payload.id);
        if (index >= 0) {
          state.items[index] = action.payload;
        }
      });
  },
});

export const { setFilters, setPagination, clearDetail } = runsSlice.actions;
export default runsSlice.reducer;
