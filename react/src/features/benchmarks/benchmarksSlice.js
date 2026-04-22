import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  createBenchmarkApi,
  deleteBenchmarkApi,
  getBenchmarkApi,
  listBenchmarksApi,
} from "../../api/benchmarks";

export const loadBenchmarks = createAsyncThunk(
  "benchmarks/load",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await listBenchmarksApi();
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

export const createBenchmark = createAsyncThunk(
  "benchmarks/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await createBenchmarkApi(payload);
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

export const loadBenchmarkDetail = createAsyncThunk(
  "benchmarks/detail",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await getBenchmarkApi(id);
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

export const deleteBenchmark = createAsyncThunk(
  "benchmarks/delete",
  async (id, { rejectWithValue }) => {
    try {
      await deleteBenchmarkApi(id);
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

const benchmarksSlice = createSlice({
  name: "benchmarks",
  initialState: {
    items: [],
    status: "idle",
    error: null,
    detail: null,
    detailStatus: "idle",
    detailError: null,
  },
  reducers: {
    clearBenchmarkDetail(state) {
      state.detail = null;
      state.detailStatus = "idle";
      state.detailError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadBenchmarks.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadBenchmarks.fulfilled, (state, action) => {
        state.status = "ok";
        state.items = action.payload;
      })
      .addCase(loadBenchmarks.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      })
      .addCase(createBenchmark.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(loadBenchmarkDetail.pending, (state) => {
        state.detailStatus = "loading";
        state.detailError = null;
      })
      .addCase(loadBenchmarkDetail.fulfilled, (state, action) => {
        state.detailStatus = "ok";
        state.detail = action.payload;

        const index = state.items.findIndex(
          (item) => item.id === action.payload.benchmark.id
        );
        if (index >= 0) {
          state.items[index] = action.payload.benchmark;
        }
      })
      .addCase(loadBenchmarkDetail.rejected, (state, action) => {
        state.detailStatus = "fail";
        state.detailError = action.payload;
      })
      .addCase(deleteBenchmark.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
        if (state.detail?.benchmark?.id === action.payload) {
          state.detail = null;
        }
      });
  },
});

export const { clearBenchmarkDetail } = benchmarksSlice.actions;
export default benchmarksSlice.reducer;
