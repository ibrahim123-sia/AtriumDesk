import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().auth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// Rev 5 §6.1/§6.4 — student-facing Events, replacing the retired Apify
// LinkedIn-caption-scraping Events.jsx. Manual-entry only (§6.4's reality
// check found no viable scrape source for MAJU's own events).

export const fetchEvents = createAsyncThunk(
  "event/fetch",
  async ({ when, department, search } = {}, { getState }) => {
    try {
      const params = new URLSearchParams();
      if (when) params.set("when", when);
      if (department) params.set("department", department);
      if (search) params.set("search", search);
      const qs = params.toString();
      const { data } = await axios.get(`/api/events${qs ? `?${qs}` : ""}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load events") };
    }
  }
);

export const fetchEventById = createAsyncThunk(
  "event/fetchById",
  async (id, { getState }) => {
    try {
      const { data } = await axios.get(`/api/events/${id}`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load event") };
    }
  }
);

// Rev 5 §6.1/§6.4 — matched feed, primary view over plain browse, ranked by
// department + interest overlap rather than jobs/scholarships' numeric
// eligibility (there's no CGPA/deadline concept for an event).
export const fetchMatchedEvents = createAsyncThunk(
  "event/fetchMatched",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get(`/api/events/matched`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load matched events") };
    }
  }
);

const eventSlice = createSlice({
  name: "event",
  initialState: {
    events: [], total: 0, selected: null, loading: false, detailLoading: false,
    matched: [], matchedLoading: false,
  },
  reducers: {
    clearSelectedEvent(state) {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state) => { state.loading = true; })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.events = action.payload.events;
          state.total = action.payload.total;
        }
      })
      .addCase(fetchEvents.rejected, (state) => { state.loading = false; })
      .addCase(fetchEventById.pending, (state) => { state.detailLoading = true; })
      .addCase(fetchEventById.fulfilled, (state, action) => {
        state.detailLoading = false;
        if (action.payload.success) state.selected = action.payload.event;
      })
      .addCase(fetchEventById.rejected, (state) => { state.detailLoading = false; })
      .addCase(fetchMatchedEvents.pending, (state) => { state.matchedLoading = true; })
      .addCase(fetchMatchedEvents.fulfilled, (state, action) => {
        state.matchedLoading = false;
        if (action.payload.success) state.matched = action.payload.matched;
      })
      .addCase(fetchMatchedEvents.rejected, (state) => { state.matchedLoading = false; });
  },
});

export const { clearSelectedEvent } = eventSlice.actions;
export default eventSlice.reducer;
