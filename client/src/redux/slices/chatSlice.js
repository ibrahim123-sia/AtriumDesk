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
        return { success: true, chatId: data.chatId };
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
  },
  extraReducers: (builder) => {
    builder.addCase(fetchUsersChats.fulfilled, (state, action) => {
      if (action.payload.success && action.payload.chats) {
        state.chats = action.payload.chats;
        if (!state.selectedChat) {
          state.selectedChat = action.payload.chats[0];
        }
      }
    });
  },
});

export const { setSelectedChat, setChats, resetChat } = chatSlice.actions;
export default chatSlice.reducer;
