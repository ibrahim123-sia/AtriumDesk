import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

// Administrator self-service branding (Rev 5 §11 / T1) — GET/PATCH
// /api/admin/tenant. Separate from `branding` below, which is what the
// whole app currently has applied (populated from login/getUser).
export const fetchTenantSettings = createAsyncThunk(
  "tenant/fetchSettings",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/admin/tenant", authHeader(getState));
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to load tenant settings",
      };
    }
  }
);

export const updateTenantSettings = createAsyncThunk(
  "tenant/updateSettings",
  async (body, { getState }) => {
    try {
      const { data } = await axios.patch("/api/admin/tenant", body, authHeader(getState));
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to update tenant settings",
      };
    }
  }
);

// Populated from the `tenantBranding` field on login/getUser responses
// (server/controllers/userController.js) — the self-service branding fields
// an Administrator edits on the Settings page, applied client-side.
const initialState = {
  branding: null, // { universityName, universityShort, logoUrl, primaryColor, supportEmail }
  settings: null, // full editable record: { slug, name, branding, emailDomains, staffEmailDomainPattern }
  feeConfig: null, // { feePerCreditHour } — semester fee calculator's admin-set rate
  loading: false,
  submitting: false,
};

const tenantSlice = createSlice({
  name: "tenant",
  initialState,
  reducers: {
    setTenantBranding(state, action) {
      state.branding = action.payload || null;
    },
    setFeeConfig(state, action) {
      state.feeConfig = action.payload || null;
    },
    clearTenantBranding(state) {
      state.branding = null;
      state.settings = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenantSettings.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTenantSettings.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) state.settings = action.payload.tenant;
      })
      .addCase(fetchTenantSettings.rejected, (state) => {
        state.loading = false;
      })
      .addCase(updateTenantSettings.pending, (state) => {
        state.submitting = true;
      })
      .addCase(updateTenantSettings.fulfilled, (state, action) => {
        state.submitting = false;
        if (action.payload.success) {
          state.settings = action.payload.tenant;
          // Reflect the change in the whole app immediately, not just the
          // Settings form — no need to log out/in to see it take effect.
          state.branding = action.payload.tenant.branding;
        }
      })
      .addCase(updateTenantSettings.rejected, (state) => {
        state.submitting = false;
      });
  },
});

export const { setTenantBranding, setFeeConfig, clearTenantBranding } = tenantSlice.actions;
export default tenantSlice.reducer;
