import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchModelFilesApi } from "../../api/modelFiles";

export const fetchModelFiles = createAsyncThunk(
  "modelFiles/fetch",
  async (_, { getState, rejectWithValue }) => {
    try {
      const { filters, pagination } = getState().modelFiles;
      const params = {
        ...filters,
        limit: pagination.pageSize,
        offset: (pagination.current - 1) * pagination.pageSize,
      };
      const res = await fetchModelFilesApi(params);
      return res;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const initialState = {
  files: [],
  total: 0,
  loading: false,
  filters: {},
  pagination: { current: 1, pageSize: 20 },
  error: null,
};

const modelFilesSlice = createSlice({
  name: "modelFiles",
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = action.payload;
    },
    setPagination(state, action) {
      state.pagination = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchModelFiles.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(fetchModelFiles.fulfilled, (s, a) => {
        s.loading = false;
        s.files = a.payload.items;
        s.total = a.payload.total;
      })
      .addCase(fetchModelFiles.rejected, (s, a) => {
        s.loading = false;
        s.error = a.payload;
      });
  },
});

export const { setFilters, setPagination } = modelFilesSlice.actions;
export default modelFilesSlice.reducer;
