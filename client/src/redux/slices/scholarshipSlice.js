import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().auth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// Rev 5 §6.1/§6.2 — student-facing scholarships: study-abroad ones
// (scope "external", browse + matched feed) and the university's own
// awards (scope "internal"), both published by its admin as listings.

// `offset` > 0 appends the next page ("Load more") instead of replacing.
export const fetchScholarships = createAsyncThunk(
  "scholarship/fetch",
  async ({ country, fundingType, degreeLevel, scope, search, offset = 0 } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (country) params.set("country", country);
      if (fundingType) params.set("fundingType", fundingType);
      if (degreeLevel) params.set("degreeLevel", degreeLevel);
      if (scope) params.set("scope", scope);
      if (search) params.set("search", search);
      if (offset) params.set("offset", String(offset));
      const qs = params.toString();
      const { data } = await axios.get(`/api/scholarships${qs ? `?${qs}` : ""}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load scholarships") };
    }
  }
);

export const fetchInternalScholarships = createAsyncThunk(
  "scholarship/fetchInternal",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get(`/api/scholarships?scope=internal&limit=100`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load scholarships") };
    }
  }
);

export const fetchScholarshipById = createAsyncThunk(
  "scholarship/fetchById",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(`/api/scholarships/${id}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load scholarship") };
    }
  }
);

// Rev 5 §6.1/§8 — the matched feed (Layer 1 hard-rule filter + Layer 3
// explanations, computed server-side) is the PRIMARY view; plain browse
// above is secondary.
export const fetchMatchedScholarships = createAsyncThunk(
  "scholarship/fetchMatched",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get(`/api/scholarships/matched`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load matched scholarships") };
    }
  }
);

const scholarshipSlice = createSlice({
  name: "scholarship",
  initialState: {
    scholarships: [], total: 0, selected: null, loading: false, detailLoading: false, detailError: null,
    matched: [], matchedLoading: false,
    internal: [], internalLoading: false,
  },
  reducers: {
    clearSelectedScholarship(state) {
      state.selected = null;
      state.detailError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchScholarships.pending, (state) => { state.loading = true; })
      .addCase(fetchScholarships.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.scholarships = action.meta.arg?.offset
            ? [...state.scholarships, ...action.payload.scholarships]
            : action.payload.scholarships;
          state.total = action.payload.total;
        }
      })
      .addCase(fetchScholarships.rejected, (state) => { state.loading = false; })
      .addCase(fetchInternalScholarships.pending, (state) => { state.internalLoading = true; })
      .addCase(fetchInternalScholarships.fulfilled, (state, action) => {
        state.internalLoading = false;
        if (action.payload.success) state.internal = action.payload.scholarships;
      })
      .addCase(fetchInternalScholarships.rejected, (state) => { state.internalLoading = false; })
      .addCase(fetchScholarshipById.pending, (state) => {
        state.detailLoading = true;
        state.detailError = null;
      })
      .addCase(fetchScholarshipById.fulfilled, (state, action) => {
        state.detailLoading = false;
        if (action.payload.success) state.selected = action.payload.scholarship;
        else state.detailError = action.payload.message || "This scholarship isn't available";
      })
      .addCase(fetchScholarshipById.rejected, (state) => { state.detailLoading = false; })
      .addCase(fetchMatchedScholarships.pending, (state) => { state.matchedLoading = true; })
      .addCase(fetchMatchedScholarships.fulfilled, (state, action) => {
        state.matchedLoading = false;
        if (action.payload.success) state.matched = action.payload.matched;
      })
      .addCase(fetchMatchedScholarships.rejected, (state) => { state.matchedLoading = false; });
  },
});

export const { clearSelectedScholarship } = scholarshipSlice.actions;
export default scholarshipSlice.reducer;
