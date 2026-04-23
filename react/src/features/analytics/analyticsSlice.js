import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { fetchAnalyticsSummaryApi } from "../../api/analytics";

export const loadAnalytics = createAsyncThunk(
  "analytics/load",
  async (filters = {}, { rejectWithValue }) => {
    try {
      const { data } = await fetchAnalyticsSummaryApi(filters);
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

const analyticsSlice = createSlice({
  name: "analytics",
  initialState: {
    data: null,
    status: "idle",
    error: null,
    filters: {},
  },
  reducers: {
    setAnalyticsFilters(state, action) {
      state.filters = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAnalytics.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadAnalytics.fulfilled, (state, action) => {
        state.status = "ok";
        state.data = action.payload;
      })
      .addCase(loadAnalytics.rejected, (state, action) => {
        state.status = "fail";
        state.error = action.payload;
      });
  },
});

export const { setAnalyticsFilters } = analyticsSlice.actions;
export default analyticsSlice.reducer;
