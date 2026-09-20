import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

// Rev7 §5.9/T2 — Super Admin auth is a completely separate domain from the
// tenant-scoped authSlice: different backend model (SuperAdminUser, not
// User), different JWT (PLATFORM_JWT_SECRET), different localStorage key
// (never shares "token" with the tenant session, so impersonating a tenant
// admin — see authSlice's startImpersonation — never clobbers the Super
// Admin's own standing session).

export const loginSuperAdmin = createAsyncThunk(
  "platformAuth/login",
  async ({ email, password }) => {
    try {
      const { data } = await axios.post("/api/platform/auth/login", { email, password });
      if (data.success) {
        localStorage.setItem("platformToken", data.token);
        return { success: true, token: data.token, superAdmin: data.superAdmin };
      }
      return { success: false, message: data.message };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || "Login failed" };
    }
  }
);

const platformAuthSlice = createSlice({
  name: "platformAuth",
  initialState: {
    token: localStorage.getItem("platformToken") || null,
    superAdmin: null,
  },
  reducers: {
    logoutSuperAdmin(state) {
      localStorage.removeItem("platformToken");
      state.token = null;
      state.superAdmin = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loginSuperAdmin.fulfilled, (state, action) => {
      if (action.payload.success) {
        state.token = action.payload.token;
        state.superAdmin = action.payload.superAdmin;
      }
    });
  },
});

export const { logoutSuperAdmin } = platformAuthSlice.actions;
export default platformAuthSlice.reducer;
