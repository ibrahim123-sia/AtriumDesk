import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({ headers: { Authorization: getState().platformAuth.token } });
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

// Rev7 §6/T2+T3 — Super Admin console: tenant lifecycle, cross-tenant
// health, platform audit log, billing, impersonation.

export const fetchTenants = createAsyncThunk("platform/fetchTenants", async (_, { getState }) => {
  try {
    const { data } = await axios.get("/api/platform/tenants", authHeader(getState));
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to load tenants") };
  }
});

// `payload.logoFile` (optional File) forces a multipart request — the
// nested `branding`/`enabledFeatures` objects are JSON-stringified since
// multipart fields are flat strings (server parses them back, see
// platformController.js's createTenant).
export const createTenant = createAsyncThunk("platform/createTenant", async (payload, { getState }) => {
  try {
    const { logoFile, branding, enabledFeatures, ...rest } = payload;
    let body = payload;
    let headers = authHeader(getState).headers;
    if (logoFile) {
      const fd = new FormData();
      Object.entries(rest).forEach(([k, v]) => fd.append(k, v));
      fd.append("branding", JSON.stringify(branding));
      fd.append("enabledFeatures", JSON.stringify(enabledFeatures));
      fd.append("logo", logoFile);
      body = fd;
      headers = { ...headers, "Content-Type": "multipart/form-data" };
    }
    const { data } = await axios.post("/api/platform/tenants", body, { headers });
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to create tenant") };
  }
});

export const suspendTenant = createAsyncThunk("platform/suspendTenant", async (slug, { getState }) => {
  try {
    const { data } = await axios.patch(`/api/platform/tenants/${slug}/suspend`, {}, authHeader(getState));
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to suspend tenant") };
  }
});

export const reactivateTenant = createAsyncThunk("platform/reactivateTenant", async (slug, { getState }) => {
  try {
    const { data } = await axios.patch(`/api/platform/tenants/${slug}/reactivate`, {}, authHeader(getState));
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to reactivate tenant") };
  }
});

export const updateTenantBilling = createAsyncThunk(
  "platform/updateTenantBilling",
  async ({ slug, billing }, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/platform/tenants/${slug}/billing`, billing, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to update billing") };
    }
  }
);

export const updateTenantFeatures = createAsyncThunk(
  "platform/updateTenantFeatures",
  async ({ slug, enabledFeatures, logoFile, primaryColor }, { getState }) => {
    try {
      const fd = new FormData();
      fd.append("enabledFeatures", JSON.stringify(enabledFeatures));
      if (primaryColor !== undefined) fd.append("primaryColor", primaryColor);
      if (logoFile) fd.append("logo", logoFile);
      const { data } = await axios.patch(`/api/platform/tenants/${slug}/features`, fd, {
        headers: { ...authHeader(getState).headers, "Content-Type": "multipart/form-data" },
      });
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to update features") };
    }
  }
);

export const impersonateTenant = createAsyncThunk("platform/impersonateTenant", async (slug, { getState }) => {
  try {
    const { data } = await axios.post(`/api/platform/tenants/${slug}/impersonate`, {}, authHeader(getState));
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to start impersonation") };
  }
});

// General tenant edit (name/branding/emailDomains/staffEmailDomainPattern/
// studentEmailPattern) — superset of updateTenantFeatures above, added so
// Super Admin can fix a tenant's own settings without impersonating.
export const updateTenant = createAsyncThunk(
  "platform/updateTenant",
  async ({ slug, ...fields }, { getState }) => {
    try {
      const { data } = await axios.patch(`/api/platform/tenants/${slug}`, fields, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to update tenant") };
    }
  }
);

export const fetchDashboard = createAsyncThunk("platform/fetchDashboard", async (_, { getState }) => {
  try {
    const { data } = await axios.get("/api/platform/dashboard", authHeader(getState));
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to load dashboard") };
  }
});

export const fetchUsage = createAsyncThunk("platform/fetchUsage", async (days, { getState }) => {
  try {
    const { data } = await axios.get(`/api/platform/usage${days ? `?days=${days}` : ""}`, authHeader(getState));
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to load usage") };
  }
});

export const fetchTenantAnalytics = createAsyncThunk(
  "platform/fetchTenantAnalytics",
  async (slug, { getState }) => {
    try {
      const { data } = await axios.get(`/api/platform/tenants/${slug}/analytics`, authHeader(getState));
      return data;
    } catch (error) {
      return { success: false, message: errorMessage(error, "Failed to load tenant analytics") };
    }
  }
);

export const fetchPlatformHealth = createAsyncThunk("platform/fetchHealth", async (_, { getState }) => {
  try {
    const { data } = await axios.get("/api/platform/health", authHeader(getState));
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to load platform health") };
  }
});

export const fetchAuditLogs = createAsyncThunk("platform/fetchAuditLogs", async (_, { getState }) => {
  try {
    const { data } = await axios.get("/api/platform/audit-logs", authHeader(getState));
    return data;
  } catch (error) {
    return { success: false, message: errorMessage(error, "Failed to load audit logs") };
  }
});

const platformSlice = createSlice({
  name: "platform",
  initialState: {
    tenants: [],
    health: [],
    auditLogs: [],
    dashboard: null,
    usage: null,
    usageLoading: false,
    usageError: null,
    tenantAnalytics: null,
    loading: false,
    creating: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenants.pending, (state) => { state.loading = true; })
      .addCase(fetchTenants.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) state.tenants = action.payload.tenants;
      })
      .addCase(fetchTenants.rejected, (state) => { state.loading = false; })
      .addCase(createTenant.pending, (state) => { state.creating = true; })
      .addCase(createTenant.fulfilled, (state, action) => {
        state.creating = false;
        if (action.payload.success) state.tenants.unshift(action.payload.tenant);
      })
      .addCase(createTenant.rejected, (state) => { state.creating = false; })
      .addCase(suspendTenant.fulfilled, (state, action) => {
        if (action.payload.success) {
          const i = state.tenants.findIndex((t) => t.slug === action.payload.tenant.slug);
          if (i !== -1) state.tenants[i] = action.payload.tenant;
        }
      })
      .addCase(reactivateTenant.fulfilled, (state, action) => {
        if (action.payload.success) {
          const i = state.tenants.findIndex((t) => t.slug === action.payload.tenant.slug);
          if (i !== -1) state.tenants[i] = action.payload.tenant;
        }
      })
      .addCase(updateTenantBilling.fulfilled, (state, action) => {
        if (action.payload.success) {
          const i = state.tenants.findIndex((t) => t.slug === action.payload.tenant.slug);
          if (i !== -1) state.tenants[i] = action.payload.tenant;
        }
      })
      .addCase(updateTenantFeatures.fulfilled, (state, action) => {
        if (action.payload.success) {
          const i = state.tenants.findIndex((t) => t.slug === action.payload.tenant.slug);
          if (i !== -1) state.tenants[i] = action.payload.tenant;
        }
      })
      .addCase(updateTenant.fulfilled, (state, action) => {
        if (action.payload.success) {
          const i = state.tenants.findIndex((t) => t.slug === action.payload.tenant.slug);
          if (i !== -1) state.tenants[i] = action.payload.tenant;
        }
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        if (action.payload.success) state.dashboard = action.payload;
      })
      .addCase(fetchUsage.pending, (state) => {
        state.usageLoading = true;
        state.usageError = null;
      })
      .addCase(fetchUsage.fulfilled, (state, action) => {
        state.usageLoading = false;
        if (action.payload.success) {
          state.usage = action.payload;
        } else {
          state.usageError = action.payload.message || "Failed to load usage";
        }
      })
      .addCase(fetchUsage.rejected, (state, action) => {
        state.usageLoading = false;
        state.usageError = action.error?.message || "Failed to load usage";
      })
      .addCase(fetchTenantAnalytics.fulfilled, (state, action) => {
        if (action.payload.success) state.tenantAnalytics = action.payload.analytics;
      })
      .addCase(fetchPlatformHealth.fulfilled, (state, action) => {
        if (action.payload.success) state.health = action.payload.tenants;
      })
      .addCase(fetchAuditLogs.fulfilled, (state, action) => {
        if (action.payload.success) state.auditLogs = action.payload.logs;
      });
  },
});

export default platformSlice.reducer;
