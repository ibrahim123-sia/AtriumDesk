import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";
import { setTenantBranding, setFeeConfig } from "./tenantSlice";
import { captureGuestTenant, guestTenantParams } from "../../utils/guestTenant";

// Before the initial state reads the stored guest session (a link to a
// different university starts a fresh one).
captureGuestTenant();

// Populates tenant.branding for guests, who have no login response to get it
// from otherwise — GuestChat.jsx previously had no branding source at all
// and hardcoded MAJU's name/copy directly.
export const fetchGuestBranding = createAsyncThunk(
  "guest/fetchBranding",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/guest/branding", { params: guestTenantParams() });
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
        ...(sessionId ? { sessionId } : {}),
        ...guestTenantParams(),
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
      // Chatbot switched off or the university unavailable: say so.
      if ([403, 404].includes(error.response?.status) && error.response?.data?.message) {
        return { success: false, message: error.response.data.message };
      }
      let message = "Failed to send message";
      if (error.response?.status === 429) message = error.response?.data?.message || "Too many messages";
      else if (error.code === "ERR_NETWORK") message = "Network error";
      return { success: false, message };
    }
  }
);

// Thumbs up/down on an answer; a thumbs-down flags the question as a gap
// in the university's admissions content (Rev 5 §19.7).
export const sendGuestFeedback = createAsyncThunk(
  "guest/feedback",
  async ({ answerIndex, helpful }, { getState }) => {
    try {
      const sessionId = getState().guest.guestSessionId;
      const { data } = await axios.post("/api/guest/feedback", { sessionId, answerIndex, helpful, ...guestTenantParams() });
      return { ...data, answerIndex, helpful };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || "Couldn't save your feedback" };
    }
  }
);

// Rev5 §19.2 — MAJU's own scholarships + upcoming events, for the guest
// landing page's admissions-funnel sections.
export const fetchGuestListings = createAsyncThunk(
  "guest/fetchListings",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/guest/listings", { params: guestTenantParams() });
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
      const { data } = await axios.get("/api/guest/activity-tabs", { params: guestTenantParams() });
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
  guestSessionId: (() => {
    try {
      return localStorage.getItem("guestSessionId") || null;
    } catch {
      return null;
    }
  })(),
  guestMessages: [],
  // Rev5 §19.3 — follow-up chips for the most recent assistant answer only.
  followUpChips: [],
  // Rev5 §19.2 — MAJU's own scholarships + upcoming events for the funnel.
  listings: { scholarships: [], events: [] },
  activityTabs: [],
  // Questions left before the guest-session cap (null until known).
  messagesRemaining: null,
};

const guestSlice = createSlice({
  name: "guest",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(sendGuestMessage.fulfilled, (state, action) => {
        if (!action.payload.success) return;
        // The server issues the id (and a new one if ours was unknown).
        if (action.payload.sessionId && action.payload.sessionId !== state.guestSessionId) {
          try {
            localStorage.setItem("guestSessionId", action.payload.sessionId);
          } catch {
            /* storage unavailable — the id still lives in the store */
          }
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
            sources: action.payload.reply.sources || [],
            answerIndex: action.payload.reply.answerIndex,
            safety: action.payload.reply.safety,
            feedback: undefined,
          },
        ];
        state.followUpChips = action.payload.followUpChips;
        if (typeof action.payload.messagesRemaining === "number") {
          state.messagesRemaining = action.payload.messagesRemaining;
        }
      })
      .addCase(fetchGuestChatHistory.fulfilled, (state, action) => {
        if (action.payload.success) {
          // An answer's position in the session is what feedback points at.
          state.guestMessages = action.payload.messages.map((m, i) =>
            m.role === "assistant" ? { ...m, answerIndex: i } : m
          );
        }
      })
      .addCase(sendGuestFeedback.fulfilled, (state, action) => {
        if (!action.payload.success) return;
        const message = state.guestMessages.find((m) => m.answerIndex === action.payload.answerIndex);
        if (message) message.feedback = action.payload.helpful;
      })
      .addCase(clearGuestSession.fulfilled, (state) => {
        state.guestSessionId = null;
        state.guestMessages = [];
        state.followUpChips = [];
        state.messagesRemaining = null;
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
