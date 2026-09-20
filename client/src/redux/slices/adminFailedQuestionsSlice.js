import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// GET /api/admin/failed-questions — Rev 5 §4.3. §19.7 — guest and student
// gaps are a different signal, so `userType` filters to one or the other.
export const fetchFailedQuestions = createAsyncThunk(
  "adminFailedQuestions/fetch",
  async ({ resolved, userType } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (resolved !== undefined) params.set("resolved", resolved);
      if (userType) params.set("userType", userType);
      const qs = params.toString();
      const { data } = await axios.get(`/api/admin/failed-questions${qs ? `?${qs}` : ""}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load failed-question log") };
    }
  }
);

export const resolveFailedQuestionGroup = createAsyncThunk(
  "adminFailedQuestions/resolve",
  async (ids, { getState }) => {
    try {
      const { data } = await axios.patch(
        "/api/admin/failed-questions/resolve",
        { ids },
        authHeader(getState)
      );
      return { ...data, ids };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to mark as resolved") };
    }
  }
);

const adminFailedQuestionsSlice = createSlice({
  name: "adminFailedQuestions",
  initialState: { groups: [], loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFailedQuestions.pending, (state) => { state.loading = true; })
      .addCase(fetchFailedQuestions.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) state.groups = action.payload.groups;
      })
      .addCase(fetchFailedQuestions.rejected, (state) => { state.loading = false; })
      .addCase(resolveFailedQuestionGroup.fulfilled, (state, action) => {
        if (action.payload.success) {
          const idSet = new Set(action.payload.ids);
          state.groups = state.groups.map((g) =>
            g.ids.some((id) => idSet.has(id)) ? { ...g, isResolved: true } : g
          );
        }
      });
  },
});

export default adminFailedQuestionsSlice.reducer;
