import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

const errorMessage = (error, fallback) =>
  error.response?.data?.message || fallback;

export const fetchAuditLogs = createAsyncThunk(
  "adminLog/audit",
  async ({ search = "", limit = 50, offset = 0 } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("action", search);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const { data } = await axios.get(`/api/admin/logs/audit?${params.toString()}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load audit logs") };
    }
  }
);

export const fetchLoginEvents = createAsyncThunk(
  "adminLog/logins",
  async ({ email = "", success, limit = 50, offset = 0 } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (email) params.set("email", email);
      if (success !== undefined && success !== "") params.set("success", success);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const { data } = await axios.get(`/api/admin/logs/logins?${params.toString()}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load login events") };
    }
  }
);

export const fetchChatLogs = createAsyncThunk(
  "adminLog/chats",
  async ({ search = "", flaggedOnly = false, limit = 50, offset = 0 } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (flaggedOnly) params.set("flaggedOnly", "true");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const { data } = await axios.get(`/api/admin/logs/chats?${params.toString()}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load chats") };
    }
  }
);

export const fetchChatLog = createAsyncThunk(
  "adminLog/chat",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(`/api/admin/logs/chats/${id}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load chat") };
    }
  }
);

const adminLogSlice = createSlice({
  name: "adminLog",
  initialState: {
    audit: { items: [], total: 0, loading: false },
    logins: { items: [], total: 0, loading: false },
    chats: { items: [], total: 0, loading: false },
    selectedChat: null,
    selectedUser: null,
    chatLoading: false,
  },
  reducers: {
    clearSelectedChat(state) {
      state.selectedChat = null;
      state.selectedUser = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditLogs.pending, (state) => { state.audit.loading = true; })
      .addCase(fetchAuditLogs.fulfilled, (state, action) => {
        state.audit.loading = false;
        if (action.payload.success) {
          state.audit.items = action.payload.items;
          state.audit.total = action.payload.total;
        }
      })
      .addCase(fetchAuditLogs.rejected, (state) => { state.audit.loading = false; })
      .addCase(fetchLoginEvents.pending, (state) => { state.logins.loading = true; })
      .addCase(fetchLoginEvents.fulfilled, (state, action) => {
        state.logins.loading = false;
        if (action.payload.success) {
          state.logins.items = action.payload.items;
          state.logins.total = action.payload.total;
        }
      })
      .addCase(fetchLoginEvents.rejected, (state) => { state.logins.loading = false; })
      .addCase(fetchChatLogs.pending, (state) => { state.chats.loading = true; })
      .addCase(fetchChatLogs.fulfilled, (state, action) => {
        state.chats.loading = false;
        if (action.payload.success) {
          state.chats.items = action.payload.items;
          state.chats.total = action.payload.total;
        }
      })
      .addCase(fetchChatLogs.rejected, (state) => { state.chats.loading = false; })
      .addCase(fetchChatLog.pending, (state) => { state.chatLoading = true; })
      .addCase(fetchChatLog.fulfilled, (state, action) => {
        state.chatLoading = false;
        if (action.payload.success) {
          state.selectedChat = action.payload.chat;
          state.selectedUser = action.payload.user;
        }
      })
      .addCase(fetchChatLog.rejected, (state) => { state.chatLoading = false; });
  },
});

export const { clearSelectedChat } = adminLogSlice.actions;
export default adminLogSlice.reducer;
