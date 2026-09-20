import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

const errorMessage = (error, fallback) => {
  if (error.response?.status === 401) return "Session expired";
  if (error.response?.status === 403) return error.response?.data?.message || "Access denied";
  if (error.code === "ERR_NETWORK") return "Network error";
  return error.response?.data?.message || fallback;
};

// 409 responses carry the freshest issue payload so the UI can show "Sara just
// resolved this" and let the user retry against the new state.
const conflictPayload = (error) => ({
  success: false,
  conflict: true,
  message: error.response?.data?.message || "This issue was just updated by another staff member.",
  issue: error.response?.data?.issue || null,
});

export const createIssue = createAsyncThunk(
  "issue/create",
  async ({ title, description, category, departmentId, files }, { getState }) => {
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("description", description);
      fd.append("category", category || "other");
      fd.append("departmentId", departmentId);
      if (files && files.length) {
        for (const f of files) fd.append("attachments", f);
      }
      const { data } = await axios.post("/api/issue", fd, {
        headers: {
          Authorization: getState().auth.token,
          "Content-Type": "multipart/form-data",
        },
      });
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to create issue") };
    }
  }
);

export const fetchMyIssues = createAsyncThunk(
  "issue/fetchMy",
  async (status, { getState }) => {
    try {
      const params = status ? `?status=${encodeURIComponent(status)}` : "";
      const { data } = await axios.get(`/api/issue/my${params}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load issues") };
    }
  }
);

export const fetchIssueById = createAsyncThunk(
  "issue/fetchById",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(`/api/issue/${id}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load issue") };
    }
  }
);

export const addStudentReply = createAsyncThunk(
  "issue/replyStudent",
  async ({ id, message }, { getState }) => {
    try {
      const { data } = await axios.post(
        `/api/issue/${id}/reply`,
        { message },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to send reply") };
    }
  }
);

// GET /api/issue/department-suggestion?question=... — Rev 5 §4.2 handoff.
export const fetchDepartmentSuggestion = createAsyncThunk(
  "issue/fetchDepartmentSuggestion",
  async (question, { getState }) => {
    try {
      const { data } = await axios.get(
        `/api/issue/department-suggestion?question=${encodeURIComponent(question)}`,
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to get a department suggestion") };
    }
  }
);

// POST /api/issue/from-chat — one-click chatbot->issue handoff (Rev 5 §4.2).
export const createIssueFromChat = createAsyncThunk(
  "issue/createFromChat",
  async ({ chatId, departmentId, suggestedDepartmentId, title, description }, { getState }) => {
    try {
      const { data } = await axios.post(
        "/api/issue/from-chat",
        { chatId, departmentId, suggestedDepartmentId, title, description },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to file a query") };
    }
  }
);

export const submitIssueFeedback = createAsyncThunk(
  "issue/submitFeedback",
  async ({ id, thumbsUp, rating, comment }, { getState }) => {
    try {
      const { data } = await axios.post(
        `/api/issue/${id}/feedback`,
        { thumbsUp, rating, comment },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to submit feedback") };
    }
  }
);

export const fetchDeptStats = createAsyncThunk(
  "issue/fetchDeptStats",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/issue/department/stats", authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load stats") };
    }
  }
);

export const fetchDeptIssues = createAsyncThunk(
  "issue/fetchDept",
  async (arg, { getState }) => {
    // Accepts either a bare status string (legacy call sites) or
    // { status, escalated } for the Rev 5 §4.1 escalated-only filter.
    const { status, escalated } = typeof arg === "string" ? { status: arg } : arg || {};
    try {
      const query = new URLSearchParams();
      if (status) query.set("status", status);
      if (escalated) query.set("escalated", "true");
      const qs = query.toString();
      const { data } = await axios.get(
        `/api/issue/department${qs ? `?${qs}` : ""}`,
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load department issues") };
    }
  }
);

export const fetchDeptIssueById = createAsyncThunk(
  "issue/fetchDeptById",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(
        `/api/issue/department/${id}`,
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load issue") };
    }
  }
);

export const updateIssueStatus = createAsyncThunk(
  "issue/updateStatus",
  async ({ id, status, reason, expectedUpdatedAt }, { getState }) => {
    try {
      const { data } = await axios.patch(
        `/api/issue/department/${id}/status`,
        { status, reason, expectedUpdatedAt },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      if (error.response?.status === 409) return conflictPayload(error);
      return { success: false, message: errorMessage(error, "Failed to update status") };
    }
  }
);

export const addStaffReply = createAsyncThunk(
  "issue/replyStaff",
  async ({ id, message, status, reason, expectedUpdatedAt }, { getState }) => {
    try {
      const { data } = await axios.post(
        `/api/issue/department/${id}/sfo-reply`,
        { message, status, reason, expectedUpdatedAt },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      if (error.response?.status === 409) return conflictPayload(error);
      return { success: false, message: errorMessage(error, "Failed to send reply") };
    }
  }
);

export const assignIssue = createAsyncThunk(
  "issue/assign",
  async ({ id, assigneeId, expectedUpdatedAt }, { getState }) => {
    try {
      const { data } = await axios.patch(
        `/api/issue/department/${id}/assign`,
        { assigneeId, expectedUpdatedAt },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      if (error.response?.status === 409) return conflictPayload(error);
      return { success: false, message: errorMessage(error, "Failed to reassign issue") };
    }
  }
);

export const fetchDeptStaff = createAsyncThunk(
  "issue/fetchDeptStaff",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/issue/department/staff", authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load staff") };
    }
  }
);

const initialState = {
  myIssues: [],
  deptIssues: [],
  selectedIssue: null,
  deptStats: null,
  deptStatsLoading: false,
  deptStaff: [],
  loading: false,
  submitting: false,
};

const issueSlice = createSlice({
  name: "issue",
  initialState,
  reducers: {
    clearSelectedIssue(state) {
      state.selectedIssue = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyIssues.pending, (state) => { state.loading = true; })
      .addCase(fetchMyIssues.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) state.myIssues = action.payload.issues;
      })
      .addCase(fetchMyIssues.rejected, (state) => { state.loading = false; })
      .addCase(fetchDeptIssues.pending, (state) => { state.loading = true; })
      .addCase(fetchDeptIssues.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) state.deptIssues = action.payload.issues;
      })
      .addCase(fetchDeptIssues.rejected, (state) => { state.loading = false; })
      .addCase(fetchIssueById.fulfilled, (state, action) => {
        if (action.payload.success) state.selectedIssue = action.payload.issue;
      })
      .addCase(fetchDeptIssueById.fulfilled, (state, action) => {
        if (action.payload.success) state.selectedIssue = action.payload.issue;
      })
      .addCase(addStudentReply.fulfilled, (state, action) => {
        if (action.payload.success) state.selectedIssue = action.payload.issue;
      })
      .addCase(submitIssueFeedback.fulfilled, (state, action) => {
        if (action.payload.success) state.selectedIssue = action.payload.issue;
      })
      .addCase(addStaffReply.fulfilled, (state, action) => {
        // Refresh the selected issue on success AND on conflict — server
        // returned the latest version either way, so the UI stays in sync.
        if (action.payload.issue) state.selectedIssue = action.payload.issue;
      })
      .addCase(updateIssueStatus.fulfilled, (state, action) => {
        if (action.payload.issue) state.selectedIssue = action.payload.issue;
      })
      .addCase(assignIssue.fulfilled, (state, action) => {
        if (action.payload.issue) state.selectedIssue = action.payload.issue;
      })
      .addCase(fetchDeptStaff.fulfilled, (state, action) => {
        if (action.payload.success) state.deptStaff = action.payload.staff;
      })
      .addCase(createIssue.pending, (state) => { state.submitting = true; })
      .addCase(createIssue.fulfilled, (state) => { state.submitting = false; })
      .addCase(createIssue.rejected, (state) => { state.submitting = false; })
      .addCase(fetchDeptStats.pending, (state) => { state.deptStatsLoading = true; })
      .addCase(fetchDeptStats.fulfilled, (state, action) => {
        state.deptStatsLoading = false;
        if (action.payload.success) state.deptStats = action.payload.stats;
      })
      .addCase(fetchDeptStats.rejected, (state) => { state.deptStatsLoading = false; });
  },
});

export const { clearSelectedIssue } = issueSlice.actions;
export default issueSlice.reducer;
