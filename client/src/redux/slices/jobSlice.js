import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().auth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// Rev 5 §6.1/§6.3 — student-facing Jobs, replacing the retired Apify-based Job.jsx.

// `offset` > 0 appends the next page ("Load more") instead of replacing.
export const fetchJobs = createAsyncThunk(
  "job/fetch",
  async ({ workMode, location, experienceLevel, isFreshGradFriendly, search, offset = 0 } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (workMode) params.set("workMode", workMode);
      if (location) params.set("location", location);
      if (experienceLevel) params.set("experienceLevel", experienceLevel);
      if (isFreshGradFriendly !== undefined) params.set("isFreshGradFriendly", String(isFreshGradFriendly));
      if (search) params.set("search", search);
      if (offset) params.set("offset", String(offset));
      const qs = params.toString();
      const { data } = await axios.get(`/api/jobs${qs ? `?${qs}` : ""}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load jobs") };
    }
  }
);

export const fetchJobById = createAsyncThunk(
  "job/fetchById",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(`/api/jobs/${id}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load job") };
    }
  }
);

// Rev 5 §6.1/§8 — matched feed, primary view over plain browse.
export const fetchMatchedJobs = createAsyncThunk(
  "job/fetchMatched",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get(`/api/jobs/matched`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load matched jobs") };
    }
  }
);

const jobSlice = createSlice({
  name: "job",
  initialState: {
    jobs: [], total: 0, selected: null, selectedSkillGaps: [], loading: false, detailLoading: false, detailError: null,
    matched: [], matchedLoading: false,
  },
  reducers: {
    clearSelectedJob(state) {
      state.selected = null;
      state.selectedSkillGaps = [];
      state.detailError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => { state.loading = true; })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.jobs = action.meta.arg?.offset ? [...state.jobs, ...action.payload.jobs] : action.payload.jobs;
          state.total = action.payload.total;
        }
      })
      .addCase(fetchJobs.rejected, (state) => { state.loading = false; })
      .addCase(fetchJobById.pending, (state) => {
        state.detailLoading = true;
        state.detailError = null;
      })
      .addCase(fetchJobById.fulfilled, (state, action) => {
        state.detailLoading = false;
        if (action.payload.success) {
          state.selected = action.payload.job;
          state.selectedSkillGaps = action.payload.skillGaps || [];
        } else {
          state.detailError = action.payload.message || "This job isn't available";
        }
      })
      .addCase(fetchJobById.rejected, (state) => { state.detailLoading = false; })
      .addCase(fetchMatchedJobs.pending, (state) => { state.matchedLoading = true; })
      .addCase(fetchMatchedJobs.fulfilled, (state, action) => {
        state.matchedLoading = false;
        if (action.payload.success) state.matched = action.payload.matched;
      })
      .addCase(fetchMatchedJobs.rejected, (state) => { state.matchedLoading = false; });
  },
});

export const { clearSelectedJob } = jobSlice.actions;
export default jobSlice.reducer;
