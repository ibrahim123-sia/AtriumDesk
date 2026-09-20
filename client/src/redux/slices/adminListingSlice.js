import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().auth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// Rev 5 §9.1 — generic listing CRUD, parameterized by `type`
// (scholarship|job|event). One slice for all three tabs, not three copies.

export const fetchListings = createAsyncThunk(
  "adminListing/fetch",
  async ({ type, status }, { getState }) => {
    try {
      const params = new URLSearchParams({ type });
      if (status) params.set("status", status);
      const { data } = await axios.get(`/api/admin/listings?${params}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load listings") };
    }
  }
);

export const createListing = createAsyncThunk(
  "adminListing/create",
  async (payload, { getState }) => {
    try {
      const { data } = await axios.post("/api/admin/listings", payload, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to create listing") };
    }
  }
);

export const updateListing = createAsyncThunk(
  "adminListing/update",
  async ({ id, ...fields }, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/admin/listings/${id}`, fields, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to update listing") };
    }
  }
);

export const approveListing = createAsyncThunk(
  "adminListing/approve",
  async (id, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/admin/listings/${id}/approve`, {}, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to approve listing") };
    }
  }
);

export const rejectListing = createAsyncThunk(
  "adminListing/reject",
  async ({ id, reason }, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/admin/listings/${id}/reject`, { reason }, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to reject listing") };
    }
  }
);

// §8 Layer 2 — split a merged-in duplicate back out into its own
// standalone pending listing, reconstructed from the snapshot taken at
// merge time.
export const unmergeListing = createAsyncThunk(
  "adminListing/unmerge",
  async ({ id, mergeEntryId }, { getState }) => {
    try {
      const { data } = await axios.post(
        `/api/admin/listings/${id}/unmerge/${mergeEntryId}`,
        {},
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to unmerge listing") };
    }
  }
);

export const deleteListing = createAsyncThunk(
  "adminListing/delete",
  async (id, { getState }) => {
    try {
      const { data } = await axios.delete(`/api/admin/listings/${id}`, authHeader(getState));
      return { ...data, id };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to delete listing") };
    }
  }
);

const adminListingSlice = createSlice({
  name: "adminListing",
  initialState: { listings: [], loading: false },
  reducers: {},
  extraReducers: (builder) => {
    const setListing = (state, action) => {
      if (!action.payload.success) return;
      const updated = action.payload.listing;
      state.listings = state.listings.map((l) => (l._id === updated._id ? updated : l));
    };
    builder
      .addCase(fetchListings.pending, (state) => { state.loading = true; })
      .addCase(fetchListings.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) state.listings = action.payload.listings;
      })
      .addCase(fetchListings.rejected, (state) => { state.loading = false; })
      .addCase(createListing.fulfilled, (state, action) => {
        if (action.payload.success) state.listings = [action.payload.listing, ...state.listings];
      })
      .addCase(updateListing.fulfilled, setListing)
      .addCase(approveListing.fulfilled, setListing)
      .addCase(rejectListing.fulfilled, setListing)
      .addCase(unmergeListing.fulfilled, (state, action) => {
        if (!action.payload.success) return;
        setListing(state, action);
        state.listings = [action.payload.restored, ...state.listings];
      })
      .addCase(deleteListing.fulfilled, (state, action) => {
        if (action.payload.success) state.listings = state.listings.filter((l) => l._id !== action.payload.id);
      });
  },
});

export default adminListingSlice.reducer;
