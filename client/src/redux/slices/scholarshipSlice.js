import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().auth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// Rev 5 §6.1/§6.2 — student-facing external scholarships (MS-abroad
// opportunities), separate from MAJU's own internal financial-aid/
// concessions info which stays static in Scholarship.jsx.

export const fetchScholarships = createAsyncThunk(
  "scholarship/fetch",
  async ({ country, fundingType, degreeLevel, search } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (country) params.set("country", country);
      if (fundingType) params.set("fundingType", fundingType);
      if (degreeLevel) params.set("degreeLevel", degreeLevel);
      if (search) params.set("search", search);
      const qs = params.toString();
      const { data } = await axios.get(`/api/scholarships${qs ? `?${qs}` : ""}`, authHeader(getState));
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
    scholarships: [], total: 0, selected: null, loading: false, detailLoading: false,
    matched: [], matchedLoading: false,
  },
  reducers: {
    clearSelectedScholarship(state) {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchScholarships.pending, (state) => { state.loading = true; })
      .addCase(fetchScholarships.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.scholarships = action.payload.scholarships;
          state.total = action.payload.total;
        }
      })
      .addCase(fetchScholarships.rejected, (state) => { state.loading = false; })
      .addCase(fetchScholarshipById.pending, (state) => { state.detailLoading = true; })
      .addCase(fetchScholarshipById.fulfilled, (state, action) => {
        state.detailLoading = false;
        if (action.payload.success) state.selected = action.payload.scholarship;
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
