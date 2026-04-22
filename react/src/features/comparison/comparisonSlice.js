import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { runCompareApi } from "../../api/compare";

export const runComparison = createAsyncThunk(
  "comparison/run",
  async ({ file, documentType }, { rejectWithValue }) => {
    try {
      const { data } = await runCompareApi(file, documentType);
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

const initialState = {
  currentRunId: null,
  run: null,
  response: null,
  status: "idle",
  error: null,
};

const comparisonSlice = createSlice({
  name: "comparison",
  initialState,
  reducers: {
    resetComparison: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(runComparison.pending, (state) => {
        state.currentRunId = null;
        state.run = null;
        state.response = null;
        state.status = "running";
        state.error = null;
      })
      .addCase(runComparison.fulfilled, (state, action) => {
        state.currentRunId = action.payload.runId;
        state.run = action.payload.run;
        state.response = action.payload.response;
        state.status = "ok";
      })
      .addCase(runComparison.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload || "Comparison failed";
      });
  },
});

export const { resetComparison } = comparisonSlice.actions;
export default comparisonSlice.reducer;
