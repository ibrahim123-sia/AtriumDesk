import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

const errorMessage = (error, fallback) =>
  error.response?.data?.message || fallback;

export const fetchStaff = createAsyncThunk(
  "adminStaff/fetch",
  async ({ departmentId, search = "", limit = 50, offset = 0 } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      params.set("role", "staff");
      if (departmentId) params.set("departmentId", departmentId);
      if (search) params.set("search", search);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const { data } = await axios.get(`/api/admin/users?${params.toString()}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load staff") };
    }
  }
);

export const createStaff = createAsyncThunk(
  "adminStaff/create",
  async ({ name, departmentId, staffTitle, staffPermissions }, { getState }) => {
    try {
      const { data } = await axios.post(
        "/api/admin/staff",
        { name, departmentId, staffTitle, staffPermissions },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to create staff") };
    }
  }
);

export const updateStaff = createAsyncThunk(
  "adminStaff/update",
  async ({ id, name, email, departmentId, staffTitle, staffPermissions }, { getState }) => {
    try {
      const { data } = await axios.patch(
        `/api/admin/staff/${id}`,
        { name, email, departmentId, staffTitle, staffPermissions },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to update staff") };
    }
  }
);

export const deactivateStaff = createAsyncThunk(
  "adminStaff/deactivate",
  async (id, { getState }) => {
    try {
      const { data } = await axios.delete(`/api/admin/staff/${id}`, authHeader(getState));
      return { ...data, id };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to deactivate staff") };
    }
  }
);

export const fetchStaffPerformance = createAsyncThunk(
  "adminStaff/fetchPerformance",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/admin/staff/performance", authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load staff performance") };
    }
  }
);

export const fetchStaffPerformanceOne = createAsyncThunk(
  "adminStaff/fetchPerformanceOne",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(`/api/admin/staff/${id}/performance`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load staff performance") };
    }
  }
);

const adminStaffSlice = createSlice({
  name: "adminStaff",
  initialState: {
    staff: [],
    total: 0,
    loading: false,
    submitting: false,
    performance: [],
    performanceLoading: false,
    selectedPerformance: null,
    selectedPerformanceLoading: false,
  },
  reducers: {
    clearSelectedPerformance(state) {
      state.selectedPerformance = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStaff.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchStaff.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.staff = action.payload.users;
          state.total = action.payload.total ?? action.payload.users.length;
        }
      })
      .addCase(fetchStaff.rejected, (state) => {
        state.loading = false;
      })
      .addCase(createStaff.pending, (state) => { state.submitting = true; })
      .addCase(createStaff.fulfilled, (state) => { state.submitting = false; })
      .addCase(createStaff.rejected, (state) => { state.submitting = false; })
      .addCase(updateStaff.fulfilled, (state, action) => {
        if (action.payload.success) {
          const u = action.payload.user;
          state.staff = state.staff.map((s) => (s._id === u._id ? u : s));
        }
      })
      .addCase(deactivateStaff.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.staff = state.staff.map((s) =>
            s._id === action.payload.id ? { ...s, isBlocked: true } : s
          );
        }
      })
      .addCase(fetchStaffPerformance.pending, (state) => { state.performanceLoading = true; })
      .addCase(fetchStaffPerformance.fulfilled, (state, action) => {
        state.performanceLoading = false;
        if (action.payload.success) state.performance = action.payload.performance;
      })
      .addCase(fetchStaffPerformance.rejected, (state) => { state.performanceLoading = false; })
      .addCase(fetchStaffPerformanceOne.pending, (state) => { state.selectedPerformanceLoading = true; })
      .addCase(fetchStaffPerformanceOne.fulfilled, (state, action) => {
        state.selectedPerformanceLoading = false;
        if (action.payload.success) state.selectedPerformance = action.payload.performance;
      })
      .addCase(fetchStaffPerformanceOne.rejected, (state) => { state.selectedPerformanceLoading = false; });
  },
});

export const { clearSelectedPerformance } = adminStaffSlice.actions;
export default adminStaffSlice.reducer;
