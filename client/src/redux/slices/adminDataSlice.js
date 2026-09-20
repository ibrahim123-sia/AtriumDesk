import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import pythonAxios, { withAuth, withAuthMultipart } from "../../utils/pythonAxios";

const errorMessage = (error, fallback) =>
  error.response?.data?.detail ||
  error.response?.data?.message ||
  error.message ||
  fallback;

export const fetchChunks = createAsyncThunk(
  "adminData/list",
  async ({ search = "", limit = 25, offset = 0 } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (search) params.set("search", search);
      const { data } = await pythonAxios.get(`/chunks?${params.toString()}`, withAuth(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load chunks") };
    }
  }
);

export const getChunk = createAsyncThunk(
  "adminData/get",
  async (id, { getState }) => {
    try {
      const { data } = await pythonAxios.get(`/chunks/${id}`, withAuth(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load chunk") };
    }
  }
);

export const addChunk = createAsyncThunk(
  "adminData/add",
  async ({ text, source }, { getState }) => {
    try {
      const { data } = await pythonAxios.post(`/chunks`, { text, source }, withAuth(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to add chunk") };
    }
  }
);

export const updateChunk = createAsyncThunk(
  "adminData/update",
  async ({ id, text }, { getState }) => {
    try {
      const { data } = await pythonAxios.patch(`/chunks/${id}`, { text }, withAuth(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to update chunk") };
    }
  }
);

export const deleteChunk = createAsyncThunk(
  "adminData/delete",
  async (id, { getState }) => {
    try {
      const { data } = await pythonAxios.delete(`/chunks/${id}`, withAuth(getState));
      return { ...data, id };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to delete chunk") };
    }
  }
);

export const uploadDocument = createAsyncThunk(
  "adminData/upload",
  async ({ file, source }, { getState }) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (source) fd.append("source", source);
      const { data } = await pythonAxios.post(`/documents`, fd, withAuthMultipart(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to upload document") };
    }
  }
);

const adminDataSlice = createSlice({
  name: "adminData",
  initialState: {
    chunks: [],
    total: 0,
    selected: null,
    loading: false,
    detailLoading: false,
    submitting: false,
  },
  reducers: {
    clearSelectedChunk(state) { state.selected = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchChunks.pending, (state) => { state.loading = true; })
      .addCase(fetchChunks.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.chunks = action.payload.items;
          state.total = action.payload.total ?? action.payload.items.length;
        }
      })
      .addCase(fetchChunks.rejected, (state) => { state.loading = false; })
      .addCase(getChunk.pending, (state) => { state.detailLoading = true; })
      .addCase(getChunk.fulfilled, (state, action) => {
        state.detailLoading = false;
        if (action.payload.success) state.selected = action.payload.chunk;
      })
      .addCase(getChunk.rejected, (state) => { state.detailLoading = false; })
      .addCase(addChunk.pending, (state) => { state.submitting = true; })
      .addCase(addChunk.fulfilled, (state) => { state.submitting = false; })
      .addCase(addChunk.rejected, (state) => { state.submitting = false; })
      .addCase(updateChunk.pending, (state) => { state.submitting = true; })
      .addCase(updateChunk.fulfilled, (state, action) => {
        state.submitting = false;
        if (action.payload.success) state.selected = action.payload.chunk;
      })
      .addCase(updateChunk.rejected, (state) => { state.submitting = false; })
      .addCase(uploadDocument.pending, (state) => { state.submitting = true; })
      .addCase(uploadDocument.fulfilled, (state) => { state.submitting = false; })
      .addCase(uploadDocument.rejected, (state) => { state.submitting = false; });
  },
});

export const { clearSelectedChunk } = adminDataSlice.actions;
export default adminDataSlice.reducer;
