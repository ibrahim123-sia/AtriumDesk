import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

export const fetchNotifications = createAsyncThunk(
  "notification/fetch",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/notification", authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: error.response?.data?.message || "Failed to load notifications" };
    }
  }
);

export const fetchUnreadCount = createAsyncThunk(
  "notification/unreadCount",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/notification/unread-count", authHeader(getState));
      return data;
    } catch {
      return { success: false };
    }
  }
);

export const markRead = createAsyncThunk(
  "notification/markRead",
  async (id, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/notification/${id}/read`, {}, authHeader(getState));
      return data;
    } catch {
      return { success: false };
    }
  }
);

export const markAllRead = createAsyncThunk(
  "notification/markAllRead",
  async (_, { getState }) => {
    try {
      const { data } = await axios.patch("/api/notification/read-all", {}, authHeader(getState));
      return data;
    } catch {
      return { success: false };
    }
  }
);

const notificationSlice = createSlice({
  name: "notification",
  initialState: {
    notifications: [],
    unreadCount: 0,
  },
  reducers: {
    resetNotifications(state) {
      state.notifications = [];
      state.unreadCount = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        if (action.payload.success) state.notifications = action.payload.notifications;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        if (action.payload.success) state.unreadCount = action.payload.count;
      })
      .addCase(markRead.fulfilled, (state, action) => {
        if (action.payload.success) {
          const id = action.payload.notification._id;
          state.notifications = state.notifications.map((n) =>
            n._id === id ? { ...n, isRead: true } : n
          );
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllRead.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.notifications = state.notifications.map((n) => ({ ...n, isRead: true }));
          state.unreadCount = 0;
        }
      });
  },
});

export const { resetNotifications } = notificationSlice.actions;
export default notificationSlice.reducer;
