import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

export const fetchAdminStats = createAsyncThunk(
  "adminStats/fetch",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/admin/stats", authHeader(getState));
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to load stats",
      };
    }
  }
);

// How the chatbot is doing: answers, confidence, helpfulness, gaps.
export const fetchAssistantInsights = createAsyncThunk(
  "adminStats/assistant",
  async (days = 30, { getState }) => {
    try {
      const { data } = await axios.get(`/api/admin/stats/assistant?days=${days}`, authHeader(getState));
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to load assistant insights",
      };
    }
  }
);

const adminStatsSlice = createSlice({
  name: "adminStats",
  initialState: {
    stats: null,
    loading: false,
    lastUpdated: null,
    assistant: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAssistantInsights.fulfilled, (state, action) => {
        if (action.payload.success) state.assistant = action.payload;
      })
      .addCase(fetchAdminStats.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAdminStats.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.stats = action.payload.stats;
          state.lastUpdated = Date.now();
        }
      })
      .addCase(fetchAdminStats.rejected, (state) => {
        state.loading = false;
      });
  },
});

export default adminStatsSlice.reducer;
