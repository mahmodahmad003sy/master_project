import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { fetchDocumentTypes } from "../../api/compare";

export const loadDocumentTypes = createAsyncThunk(
  "documentTypes/load",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await fetchDocumentTypes();
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || error.response?.data?.message || error.message
      );
    }
  }
);

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
      });
  },
});

export default documentTypesSlice.reducer;
