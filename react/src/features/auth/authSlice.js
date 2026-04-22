import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import client from "../../api/client";
import { jwtDecode } from "jwt-decode";

export const login = createAsyncThunk(
  "auth/login",
  async (creds, { rejectWithValue }) => {
    try {
      const { data } = await client.post("/auth/login", creds);
      return data.token;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const register = createAsyncThunk(
  "auth/register",
  async (creds, { rejectWithValue }) => {
    try {
      const { data } = await client.post("/auth/register", creds);
      return data.token;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const initialState = {
  token: localStorage.getItem("token"),
  user: localStorage.getItem("token")
    ? jwtDecode(localStorage.getItem("token"))
    : null,
  status: "idle",
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
      localStorage.removeItem("token");
      delete client.defaults.headers.common["Authorization"];
    },
  },
  extraReducers: (builder) => {
    builder
      // LOGIN
      .addCase(login.pending, (s) => {
        s.status = "loading";
        s.error = null;
      })
      .addCase(login.fulfilled, (s, a) => {
        s.status = "succeeded";
        s.token = a.payload;
        s.user = jwtDecode(a.payload);
        localStorage.setItem("token", a.payload);
        client.defaults.headers.common["Authorization"] = `Bearer ${a.payload}`;
      })
      .addCase(login.rejected, (s, a) => {
        s.status = "failed";
        s.error = a.payload;
      })
      // REGISTER
      .addCase(register.pending, (s) => {
        s.status = "loading";
        s.error = null;
      })
      .addCase(register.fulfilled, (s, a) => {
        s.status = "succeeded";
        s.token = a.payload;
        s.user = jwtDecode(a.payload);
        localStorage.setItem("token", a.payload);
        client.defaults.headers.common["Authorization"] = `Bearer ${a.payload}`;
      })
      .addCase(register.rejected, (s, a) => {
        s.status = "failed";
        s.error = a.payload;
      });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
