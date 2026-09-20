import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

const errorMessage = (error, fallback) =>
  error.response?.data?.message || fallback;

export const fetchAdminUsers = createAsyncThunk(
  "adminUser/fetch",
  async ({ role = "student", search = "", isBlocked, flaggedOnly, limit = 25, offset = 0 } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (search) params.set("search", search);
      if (isBlocked !== undefined && isBlocked !== "") params.set("isBlocked", isBlocked);
      if (flaggedOnly) params.set("flaggedOnly", "true");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const { data } = await axios.get(`/api/admin/users?${params.toString()}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load users") };
    }
  }
);

export const fetchUserActivity = createAsyncThunk(
  "adminUser/activity",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(`/api/admin/users/${id}/activity`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load activity") };
    }
  }
);

export const toggleBlockUser = createAsyncThunk(
  "adminUser/block",
  async ({ id, isBlocked }, { getState }) => {
    try {
      const { data } = await axios.patch(
        `/api/admin/users/${id}/block`,
        { isBlocked },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to update block status") };
    }
  }
);

export const importStudentsCsv = createAsyncThunk(
  "adminUser/import",
  async (file, { getState }) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await axios.post("/api/admin/users/import", fd, {
        headers: { ...authHeader(getState).headers, "Content-Type": "multipart/form-data" },
      });
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to import students") };
    }
  }
);

const adminUserSlice = createSlice({
  name: "adminUser",
  initialState: {
    users: [],
    total: 0,
    loading: false,
    selectedUser: null,
    selectedActivity: null,
    detailLoading: false,
    submitting: false,
    importing: false,
    importResult: null,
  },
  reducers: {
    clearSelectedUser(state) {
      state.selectedUser = null;
      state.selectedActivity = null;
    },
    clearImportResult(state) {
      state.importResult = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdminUsers.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAdminUsers.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.users = action.payload.users;
          state.total = action.payload.total ?? action.payload.users.length;
        }
      })
      .addCase(fetchAdminUsers.rejected, (state) => {
        state.loading = false;
      })
      .addCase(fetchUserActivity.pending, (state) => {
        state.detailLoading = true;
      })
      .addCase(fetchUserActivity.fulfilled, (state, action) => {
        state.detailLoading = false;
        if (action.payload.success) {
          state.selectedUser = action.payload.user;
          state.selectedActivity = action.payload.activity;
        }
      })
      .addCase(fetchUserActivity.rejected, (state) => {
        state.detailLoading = false;
      })
      .addCase(toggleBlockUser.pending, (state) => {
        state.submitting = true;
      })
      .addCase(toggleBlockUser.fulfilled, (state, action) => {
        state.submitting = false;
        if (action.payload.success) {
          const updated = action.payload.user;
          state.users = state.users.map((u) => (u._id === updated._id ? { ...u, isBlocked: updated.isBlocked } : u));
          if (state.selectedUser && state.selectedUser._id === updated._id) {
            state.selectedUser = { ...state.selectedUser, isBlocked: updated.isBlocked };
          }
        }
      })
      .addCase(toggleBlockUser.rejected, (state) => {
        state.submitting = false;
      })
      .addCase(importStudentsCsv.pending, (state) => {
        state.importing = true;
      })
      .addCase(importStudentsCsv.fulfilled, (state, action) => {
        state.importing = false;
        if (action.payload.success) state.importResult = action.payload;
      })
      .addCase(importStudentsCsv.rejected, (state) => {
        state.importing = false;
      });
  },
});

export const { clearSelectedUser, clearImportResult } = adminUserSlice.actions;
export default adminUserSlice.reducer;
