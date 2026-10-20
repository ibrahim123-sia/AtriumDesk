import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

export const createNewChat = createAsyncThunk(
  "chat/createNew",
  async (_, { getState, dispatch }) => {
    try {
      const { user } = getState().auth;
      if (!user) return { success: false, message: "Please login first" };

      const { data } = await axios.post("/api/chat/create", {}, authHeader(getState));

      if (data.success) {
        await dispatch(fetchUsersChats());
        return { success: true, chat: data.chat };
      }
      return { success: false, message: data.message };
    } catch (error) {
      let message = "Failed to create chat";
      if (error.response?.status === 401) message = "Session expired";
      else if (error.code === "ERR_NETWORK") message = "Network error";
      return { success: false, message };
    }
  }
);

export const fetchUsersChats = createAsyncThunk(
  "chat/fetchAll",
  async (_, { getState, dispatch }) => {
    try {
      const { token, user } = getState().auth;
      if (!token || !user) return { success: false };

      const { data } = await axios.get("/api/chat/all", authHeader(getState));

      if (data.success) {
        if (data.chats.length === 0) {
          await dispatch(createNewChat());
          return { success: true, refetch: true };
        }
        return { success: true, chats: data.chats };
      }
      return { success: false, message: data.message };
    } catch (error) {
      const unauthorized = error.response?.status === 401;
      return { success: false, unauthorized };
    }
  }
);

// Thumbs up/down on one of the assistant's answers.
export const sendAnswerFeedback = createAsyncThunk(
  "chat/answerFeedback",
  async ({ chatId, messageId, helpful }, { getState }) => {
    try {
      const { data } = await axios.post(
        `/api/chat/${chatId}/messages/${messageId}/feedback`,
        { helpful },
        authHeader(getState)
      );
      return { ...data, chatId, messageId };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || "Couldn't save your feedback" };
    }
  }
);

export const deleteChat = createAsyncThunk(
  "chat/delete",
  async ({ chatId }, { getState, dispatch }) => {
    try {
      const { data } = await axios.delete("/api/chat/delete", {
        headers: { Authorization: getState().auth.token },
        data: { chatId },
      });

      if (data.success) {
        await dispatch(fetchUsersChats());
        return { success: true };
      }
      return { success: false, message: data.message };
    } catch (error) {
      let message = "Failed to delete chat";
      if (error.response?.status === 401) message = "Session expired";
      else if (error.code === "ERR_NETWORK") message = "Network error";
      return { success: false, message };
    }
  }
);

const initialState = {
  chats: [],
  selectedChat: null,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setSelectedChat(state, action) {
      state.selectedChat = action.payload;
    },
    setChats(state, action) {
      state.chats = action.payload;
    },
    resetChat(state) {
      state.chats = [];
      state.selectedChat = null;
    },
    // A sent question and its reply, kept in the store so they're still
    // there after navigating away and back (ChatPage renders from here).
    appendMessages(state, action) {
      const { chatId, messages, chatName } = action.payload;
      const update = (chat) => {
        if (!chat || chat._id !== chatId) return;
        chat.messages = [...(chat.messages || []), ...messages];
        if (chatName) chat.name = chatName;
        chat.updatedAt = new Date().toISOString();
      };
      state.chats.forEach(update);
      update(state.selectedChat);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsersChats.fulfilled, (state, action) => {
        if (action.payload.success && action.payload.chats) {
          state.chats = action.payload.chats;
          // Keep the open chat, refreshed from the server copy.
          const current = state.selectedChat && action.payload.chats.find((c) => c._id === state.selectedChat._id);
          state.selectedChat = current || action.payload.chats[0];
        }
      })
      // "New Conversation" opens the chat it just created.
      .addCase(createNewChat.fulfilled, (state, action) => {
        const created = action.payload.success && action.payload.chat;
        if (!created) return;
        state.selectedChat = state.chats.find((c) => c._id === created._id) || created;
      })
      .addCase(sendAnswerFeedback.fulfilled, (state, action) => {
        if (!action.payload.success) return;
        const { chatId, messageId, feedback } = action.payload;
        const update = (chat) => {
          if (!chat || chat._id !== chatId) return;
          const message = (chat.messages || []).find((m) => m._id === messageId);
          if (message) message.feedback = feedback;
        };
        state.chats.forEach(update);
        update(state.selectedChat);
      });
  },
});

export const { setSelectedChat, setChats, resetChat, appendMessages } = chatSlice.actions;
export default chatSlice.reducer;
