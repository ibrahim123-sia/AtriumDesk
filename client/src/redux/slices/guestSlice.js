import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";
import { setTenantBranding, setFeeConfig } from "./tenantSlice";

// Populates tenant.branding for guests, who have no login response to get it
// from otherwise — GuestChat.jsx previously had no branding source at all
// and hardcoded MAJU's name/copy directly.
export const fetchGuestBranding = createAsyncThunk(
  "guest/fetchBranding",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/guest/branding");
      if (data.success) {
        dispatch(setTenantBranding(data.branding));
        dispatch(setFeeConfig(data.feeConfig));
        return data;
      }
      return rejectWithValue(data.message);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const sendGuestMessage = createAsyncThunk(
  "guest/sendMessage",
  async ({ message }, { getState }) => {
    try {
      if (!message || message.trim().length === 0) {
        return { success: false, message: "Message cannot be empty" };
      }

      const sessionId = getState().guest.guestSessionId;

      const { data } = await axios.post("/api/guest/chat", {
        message: message.trim(),
        sessionId,
      });

      if (data.success) {
        return {
          success: true,
          reply: data.reply,
          followUpChips: data.followUpChips || [],
          sessionId: data.sessionId,
          messagesRemaining: data.messagesRemaining,
          note: data.note,
          userMessage: message.trim(),
        };
      }
      return { success: false, message: data.message };
    } catch (error) {
      // 403 with sessionCapReached carries its own register-prompt copy
      // from the server (Rev5 §19.6) — surface it as-is rather than a
      // generic fallback.
      if (error.response?.status === 403 && error.response?.data?.sessionCapReached) {
        return { success: false, message: error.response.data.message, sessionCapReached: true };
      }
      let message = "Failed to send message";
      if (error.response?.status === 429) message = error.response?.data?.message || "Too many messages";
      else if (error.code === "ERR_NETWORK") message = "Network error";
      return { success: false, message };
    }
  }
);

// Rev5 §19.2 — MAJU's own scholarships + upcoming events, for the guest
// landing page's admissions-funnel sections.
export const fetchGuestListings = createAsyncThunk(
  "guest/fetchListings",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/guest/listings");
      if (data.success) return { scholarships: data.scholarships, events: data.events };
      return rejectWithValue(data.message);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// User request — admin-managed Activity tabs (Sports, Societies, etc.) for
// the guest sidebar. Fetched by GuestSidebar.jsx itself (mounted on every
// guest page) rather than by each page, so no page has to remember to.
export const fetchGuestActivityTabs = createAsyncThunk(
  "guest/fetchActivityTabs",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/guest/activity-tabs");
      if (data.success) return data.tabs;
      return rejectWithValue(data.message);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchGuestChatHistory = createAsyncThunk(
  "guest/fetchHistory",
  async (sessionIdArg, { getState, dispatch }) => {
    try {
      const sessionId = sessionIdArg || getState().guest.guestSessionId;
      if (!sessionId) return { success: false, message: "No session ID" };

      const { data } = await axios.get(
        `/api/guest/history?sessionId=${sessionId}`
      );

      if (data.success) {
        return {
          success: true,
          messages: data.messages || [],
          sessionId: data.sessionId,
          messageCount: data.messageCount,
        };
      }
      const expired =
        data.message?.includes("expired") || data.message?.includes("not found");
      if (expired) dispatch(clearGuestSession());
      return { success: false, message: data.message };
    } catch (error) {
      dispatch(clearGuestSession());
      return { success: false, message: error.message };
    }
  }
);

export const clearGuestSession = createAsyncThunk(
  "guest/clearSession",
  async (_, { getState }) => {
    const sessionId = getState().guest.guestSessionId;
    if (sessionId) {
      try {
        await axios.post("/api/guest/clear", { sessionId });
      } catch (clearError) {
        console.log("Server session clear failed:", clearError.message);
      }
    }
    localStorage.removeItem("guestSessionId");
    return true;
  }
);

const initialState = {
  guestSessionId: localStorage.getItem("guestSessionId") || null,
  guestMessages: [],
  // Rev5 §19.3 — follow-up chips for the most recent assistant answer only.
  followUpChips: [],
  // Rev5 §19.2 — MAJU's own scholarships + upcoming events for the funnel.
  listings: { scholarships: [], events: [] },
  activityTabs: [],
};

const guestSlice = createSlice({
  name: "guest",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(sendGuestMessage.fulfilled, (state, action) => {
        if (!action.payload.success) return;
        if (!state.guestSessionId && action.payload.sessionId) {
          localStorage.setItem("guestSessionId", action.payload.sessionId);
          state.guestSessionId = action.payload.sessionId;
        }
        state.guestMessages = [
          ...state.guestMessages,
          {
            role: "user",
            content: action.payload.userMessage,
            timestamp: Date.now(),
            type: "text",
          },
          {
            role: "assistant",
            content: action.payload.reply.content,
            timestamp: action.payload.reply.timestamp,
            type: "text",
          },
        ];
        state.followUpChips = action.payload.followUpChips;
      })
      .addCase(fetchGuestChatHistory.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.guestMessages = action.payload.messages;
        }
      })
      .addCase(clearGuestSession.fulfilled, (state) => {
        state.guestSessionId = null;
        state.guestMessages = [];
        state.followUpChips = [];
      })
      .addCase(fetchGuestListings.fulfilled, (state, action) => {
        state.listings = action.payload;
      })
      .addCase(fetchGuestActivityTabs.fulfilled, (state, action) => {
        state.activityTabs = action.payload;
      });
  },
});

export default guestSlice.reducer;
