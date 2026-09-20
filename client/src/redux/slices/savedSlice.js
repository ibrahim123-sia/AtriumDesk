import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().auth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// Rev 5 §4.5/§10 — saved scholarships/jobs, the foundation for deadline
// reminders and saved-item-change alerts (server/models/SavedListing.js).

export const fetchSaved = createAsyncThunk(
  "saved/fetch",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get(`/api/saved`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load saved items") };
    }
  }
);

export const saveListing = createAsyncThunk(
  "saved/save",
  async (listingId, { getState }) => {
    try {
      const { data } = await axios.post(`/api/saved/${listingId}`, {}, authHeader(getState));
      return { ...data, listingId };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to save listing") };
    }
  }
);

export const unsaveListing = createAsyncThunk(
  "saved/unsave",
  async (listingId, { getState }) => {
    try {
      const { data } = await axios.delete(`/api/saved/${listingId}`, authHeader(getState));
      return { ...data, listingId };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to unsave listing") };
    }
  }
);

const savedSlice = createSlice({
  name: "saved",
  initialState: { saved: [], savedIds: [], loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSaved.pending, (state) => { state.loading = true; })
      .addCase(fetchSaved.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.saved = action.payload.saved;
          state.savedIds = action.payload.saved.map((s) => s.listing._id);
        }
      })
      .addCase(fetchSaved.rejected, (state) => { state.loading = false; })
      .addCase(saveListing.fulfilled, (state, action) => {
        if (action.payload.success && !state.savedIds.includes(action.payload.listingId)) {
          state.savedIds.push(action.payload.listingId);
        }
      })
      .addCase(unsaveListing.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.savedIds = state.savedIds.filter((id) => id !== action.payload.listingId);
          state.saved = state.saved.filter((s) => s.listing._id !== action.payload.listingId);
        }
      });
  },
});

export default savedSlice.reducer;
