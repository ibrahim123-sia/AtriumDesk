import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().auth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// User request — admin-managed guest-sidebar "Activity" tabs (Sports,
// Societies, etc.). Same shape as adminSourceSlice.js.

export const fetchActivityTabs = createAsyncThunk(
  "adminActivity/fetch",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/admin/activity-tabs", authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load activity tabs") };
    }
  }
);

export const createActivityTab = createAsyncThunk(
  "adminActivity/create",
  async (payload, { getState }) => {
    try {
      const { data } = await axios.post("/api/admin/activity-tabs", payload, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to create activity tab") };
    }
  }
);

export const updateActivityTab = createAsyncThunk(
  "adminActivity/update",
  async ({ id, ...payload }, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/admin/activity-tabs/${id}`, payload, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to update activity tab") };
    }
  }
);

export const deleteActivityTab = createAsyncThunk(
  "adminActivity/delete",
  async (id, { getState }) => {
    try {
      const { data } = await axios.delete(`/api/admin/activity-tabs/${id}`, authHeader(getState));
      return { ...data, id };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to delete activity tab") };
    }
  }
);

// Multipart, so no JSON Content-Type header — axios sets the correct
// multipart boundary itself when the body is a FormData instance.
export const uploadActivityImage = createAsyncThunk(
  "adminActivity/uploadImage",
  async (file, { getState }) => {
    try {
      const form = new FormData();
      form.append("image", file);
      const { data } = await axios.post("/api/admin/activity-tabs/upload-image", form, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to upload image") };
    }
  }
);

const adminActivitySlice = createSlice({
  name: "adminActivity",
  initialState: { tabs: [], loading: false },
  reducers: {},
  extraReducers: (builder) => {
    const setTab = (state, action) => {
      if (!action.payload.success || !action.payload.tab) return;
      const updated = action.payload.tab;
      const exists = state.tabs.some((t) => t._id === updated._id);
      state.tabs = exists
        ? state.tabs.map((t) => (t._id === updated._id ? updated : t))
        : [...state.tabs, updated];
    };
    builder
      .addCase(fetchActivityTabs.pending, (state) => { state.loading = true; })
      .addCase(fetchActivityTabs.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) state.tabs = action.payload.tabs;
      })
      .addCase(fetchActivityTabs.rejected, (state) => { state.loading = false; })
      .addCase(createActivityTab.fulfilled, setTab)
      .addCase(updateActivityTab.fulfilled, setTab)
      .addCase(deleteActivityTab.fulfilled, (state, action) => {
        if (action.payload.success) state.tabs = state.tabs.filter((t) => t._id !== action.payload.id);
      });
  },
});

export default adminActivitySlice.reducer;
