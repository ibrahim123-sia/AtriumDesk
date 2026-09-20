import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().auth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// Rev 5 §9.2/§9.4 — source management + health monitoring.

export const fetchSources = createAsyncThunk(
  "adminSource/fetch",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/admin/sources", authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load sources") };
    }
  }
);

// One-time sources block on the synchronous scrape (§9.4's "Scraping…"
// loading state) — this thunk can take up to ~15-30s for that case.
export const createSource = createAsyncThunk(
  "adminSource/create",
  async (payload, { getState }) => {
    try {
      const { data } = await axios.post("/api/admin/sources", payload, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to create source"), source: error.response?.data?.source };
    }
  }
);

export const runSourceNow = createAsyncThunk(
  "adminSource/runNow",
  async (id, { getState }) => {
    try {
      const { data } = await axios.post(`/api/admin/sources/${id}/run-now`, {}, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to run source") };
    }
  }
);

export const pauseSource = createAsyncThunk(
  "adminSource/pause",
  async (id, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/admin/sources/${id}/pause`, {}, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to pause source") };
    }
  }
);

export const resumeSource = createAsyncThunk(
  "adminSource/resume",
  async (id, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/admin/sources/${id}/resume`, {}, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to resume source") };
    }
  }
);

export const deleteSource = createAsyncThunk(
  "adminSource/delete",
  async (id, { getState }) => {
    try {
      const { data } = await axios.delete(`/api/admin/sources/${id}`, authHeader(getState));
      return { ...data, id };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to delete source") };
    }
  }
);

const adminSourceSlice = createSlice({
  name: "adminSource",
  initialState: { sources: [], loading: false },
  reducers: {},
  extraReducers: (builder) => {
    const setSource = (state, action) => {
      if (!action.payload.success) return;
      const updated = action.payload.source;
      state.sources = state.sources.map((s) => (s._id === updated._id ? updated : s));
    };
    builder
      .addCase(fetchSources.pending, (state) => { state.loading = true; })
      .addCase(fetchSources.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) state.sources = action.payload.sources;
      })
      .addCase(fetchSources.rejected, (state) => { state.loading = false; })
      .addCase(createSource.fulfilled, (state, action) => {
        if (action.payload.success && action.payload.source) {
          state.sources = [action.payload.source, ...state.sources];
        }
      })
      .addCase(runSourceNow.fulfilled, () => {})
      .addCase(pauseSource.fulfilled, setSource)
      .addCase(resumeSource.fulfilled, setSource)
      .addCase(deleteSource.fulfilled, (state, action) => {
        if (action.payload.success) state.sources = state.sources.filter((s) => s._id !== action.payload.id);
      });
  },
});

export default adminSourceSlice.reducer;
