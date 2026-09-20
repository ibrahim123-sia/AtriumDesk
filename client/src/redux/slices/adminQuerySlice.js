import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

const errorMessage = (error, fallback) =>
  error.response?.data?.message || fallback;

export const fetchAdminIssues = createAsyncThunk(
  "adminQuery/list",
  async (
    { departmentId, status, category, search, dateFrom, dateTo, escalatedOnly, limit = 25, offset = 0 } = {},
    { getState }
  ) => {
    try {
      const params = new URLSearchParams();
      if (departmentId) params.set("departmentId", departmentId);
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (escalatedOnly) params.set("escalated", "true");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const { data } = await axios.get(`/api/admin/issues?${params.toString()}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load issues") };
    }
  }
);

export const fetchAnalytics = createAsyncThunk(
  "adminQuery/analytics",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/admin/issues/analytics", authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load analytics") };
    }
  }
);

export const fetchAdminIssueById = createAsyncThunk(
  "adminQuery/byId",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(`/api/admin/issues/${id}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load issue") };
    }
  }
);

const adminQuerySlice = createSlice({
  name: "adminQuery",
  initialState: {
    issues: [],
    total: 0,
    analytics: null,
    selected: null,
    loading: false,
    detailLoading: false,
    analyticsLoading: false,
  },
  reducers: {
    clearSelected(state) {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdminIssues.pending, (state) => { state.loading = true; })
      .addCase(fetchAdminIssues.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.issues = action.payload.issues;
          state.total = action.payload.total ?? action.payload.issues.length;
        }
      })
      .addCase(fetchAdminIssues.rejected, (state) => { state.loading = false; })
      .addCase(fetchAnalytics.pending, (state) => { state.analyticsLoading = true; })
      .addCase(fetchAnalytics.fulfilled, (state, action) => {
        state.analyticsLoading = false;
        if (action.payload.success) state.analytics = action.payload.analytics;
      })
      .addCase(fetchAnalytics.rejected, (state) => { state.analyticsLoading = false; })
      .addCase(fetchAdminIssueById.pending, (state) => { state.detailLoading = true; })
      .addCase(fetchAdminIssueById.fulfilled, (state, action) => {
        state.detailLoading = false;
        if (action.payload.success) state.selected = action.payload.issue;
      })
      .addCase(fetchAdminIssueById.rejected, (state) => { state.detailLoading = false; });
  },
});

export const { clearSelected } = adminQuerySlice.actions;
export default adminQuerySlice.reducer;
