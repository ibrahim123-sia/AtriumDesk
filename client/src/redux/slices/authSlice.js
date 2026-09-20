import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";
import { validateMajuEmail } from "../../utils/validation";
import { resetChat } from "./chatSlice";
import { clearGuestSession } from "./guestSlice";
import { setTenantBranding, clearTenantBranding } from "./tenantSlice";

export const registerUser = createAsyncThunk(
  "auth/register",
  async ({ name, email, password }) => {
    try {
      const nameRegex = /^[A-Za-z\s]+$/;
      if (!nameRegex.test(name)) {
        return {
          success: false,
          message: "Name should contain only alphabets and spaces",
        };
      }
      if (!name || name.length < 2) {
        return { success: false, message: "Name must be at least 2 characters" };
      }

      const emailValidation = validateMajuEmail(email);
      if (!emailValidation.isValid) {
        return { success: false, message: emailValidation.error };
      }

      if (!password || password.length < 6) {
        return {
          success: false,
          message: "Password must be at least 6 characters",
        };
      }

      const { data } = await axios.post("/api/user/register", {
        name,
        email: emailValidation.email,
        password,
      });

      if (data.success) {
        return { success: true, email: emailValidation.email };
      }
      return { success: false, message: data.message };
    } catch (error) {
      let message = "Registration failed";
      if (error.response?.status === 400) {
        message = error.response?.data?.message || "Invalid data";
      } else if (error.response?.status === 409) {
        message = "User already exists";
      } else if (error.response?.status === 429) {
        message = "Too many attempts";
      } else if (error.code === "ERR_NETWORK") {
        message = "Network error";
      } else if (error.response?.data?.message) {
        message = error.response.data.message;
      }
      return { success: false, message };
    }
  }
);

export const verifyOtp = createAsyncThunk(
  "auth/verifyOtp",
  async ({ email, otp }) => {
    try {
      if (!email || !otp) {
        return { success: false, message: "Email and OTP are required" };
      }

      const emailValidation = validateMajuEmail(email);
      if (!emailValidation.isValid) {
        return { success: false, message: "Invalid email format" };
      }

      const cleanOtp = otp.toString().replace(/\s/g, "");
      if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
        return { success: false, message: "OTP must be 6 digits" };
      }

      // Rev5 §19.5 — if this browser talked to the guest chatbot before
      // registering, carry that history into the new account.
      const guestSessionId = localStorage.getItem("guestSessionId") || undefined;

      const { data } = await axios.post("/api/user/verify-otp", {
        email: emailValidation.email,
        otp: cleanOtp,
        guestSessionId,
      });

      if (data.success) {
        localStorage.setItem("token", data.token);
        if (guestSessionId) localStorage.removeItem("guestSessionId");
        return { success: true, token: data.token, user: data.user };
      }
      return {
        success: false,
        message: data.message,
        attemptsRemaining: data.attemptsRemaining,
        requiresNewOtp: data.requiresNewOtp,
      };
    } catch (error) {
      let message = "Verification failed";
      if (error.response?.status === 400) {
        message = error.response?.data?.message || "Invalid OTP";
      } else if (error.response?.status === 404) {
        message = "User not found";
      } else if (error.response?.status === 429) {
        message = "Too many attempts";
      } else if (error.code === "ERR_NETWORK") {
        message = "Network error";
      }
      return { success: false, message };
    }
  }
);

export const resendOtp = createAsyncThunk(
  "auth/resendOtp",
  async ({ email }) => {
    try {
      if (!email) return { success: false, message: "Email is required" };

      const emailValidation = validateMajuEmail(email);
      if (!emailValidation.isValid) {
        return { success: false, message: "Invalid email format" };
      }

      const { data } = await axios.post("/api/user/resend-otp", {
        email: emailValidation.email,
      });

      if (data.success) return { success: true };
      return {
        success: false,
        message: data.message,
        retryAfter: data.retryAfter,
      };
    } catch (error) {
      let message = "Failed to resend OTP";
      if (error.response?.status === 400) message = "Invalid email";
      else if (error.response?.status === 404) message = "User not found";
      else if (error.response?.status === 429) message = "Too many attempts";
      else if (error.code === "ERR_NETWORK") message = "Network error";
      return { success: false, message };
    }
  }
);

export const loginUser = createAsyncThunk(
  "auth/login",
  async ({ email, password }, { dispatch }) => {
    try {
      if (!email || !password) {
        return { success: false, message: "Email and password required" };
      }

      const normalized = email.trim().toLowerCase();
      const genericEmailRegex = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/;
      if (!genericEmailRegex.test(normalized)) {
        return { success: false, message: "Invalid email format" };
      }

      const { data } = await axios.post("/api/user/login", {
        email: normalized,
        password,
      });

      if (data.success) {
        localStorage.setItem("token", data.token);
        dispatch(clearGuestSession());
        dispatch(setTenantBranding(data.tenantBranding));
        return { success: true, token: data.token, user: data.user };
      }
      return {
        success: false,
        message: data.message,
        attemptsRemaining: data.attemptsRemaining,
        needsVerification: data.needsVerification,
        email: normalized,
      };
    } catch (error) {
      let message = "Login failed";
      if (error.response?.status === 400) message = "Invalid input";
      else if (error.response?.status === 401)
        message = "Invalid email or password";
      else if (error.response?.status === 403) {
        return {
          success: false,
          message: "Please verify your email first",
          needsVerification: true,
          email,
        };
      } else if (error.response?.status === 429) message = "Account locked";
      else if (error.code === "ERR_NETWORK") message = "Network error";
      return { success: false, message };
    }
  }
);

export const forgotPassword = createAsyncThunk(
  "auth/forgotPassword",
  async ({ email }) => {
    try {
      if (!email) return { success: false, message: "Email is required" };

      const emailValidation = validateMajuEmail(email);
      if (!emailValidation.isValid) {
        return { success: false, message: "Invalid email format" };
      }

      const { data } = await axios.post("/api/user/forgot-password", {
        email: emailValidation.email,
      });

      if (data.success) {
        return { success: true, email: emailValidation.email };
      }
      return { success: false, message: data.message };
    } catch (error) {
      let message = "Failed to send reset OTP";
      if (error.response?.status === 400) message = "Invalid email";
      else if (error.response?.status === 429) message = "Too many attempts";
      else if (error.code === "ERR_NETWORK") message = "Network error";
      return { success: false, message };
    }
  }
);

export const resetPassword = createAsyncThunk(
  "auth/resetPassword",
  async ({ email, otp, newPassword }) => {
    try {
      if (!email || !otp || !newPassword) {
        return { success: false, message: "All fields are required" };
      }

      const emailValidation = validateMajuEmail(email);
      if (!emailValidation.isValid) {
        return { success: false, message: "Invalid email format" };
      }

      if (newPassword.length < 6) {
        return {
          success: false,
          message: "Password must be at least 6 characters",
        };
      }

      const cleanOtp = otp.toString().replace(/\s/g, "");
      if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
        return { success: false, message: "OTP must be 6 digits" };
      }

      const { data } = await axios.post("/api/user/reset-password", {
        email: emailValidation.email,
        otp: cleanOtp,
        newPassword,
      });

      if (data.success) return { success: true };
      return {
        success: false,
        message: data.message,
        attemptsRemaining: data.attemptsRemaining,
      };
    } catch (error) {
      let message = "Failed to reset password";
      if (error.response?.status === 400) message = "Invalid input";
      else if (error.response?.status === 404) message = "User not found";
      else if (error.response?.status === 429) message = "Too many attempts";
      else if (error.code === "ERR_NETWORK") message = "Network error";
      return { success: false, message };
    }
  }
);

export const fetchUser = createAsyncThunk(
  "auth/fetchUser",
  async (_, { getState, dispatch }) => {
    const token = getState().auth.token;
    if (!token) return { success: false, unauthorized: true };

    try {
      const { data } = await axios.get("/api/user/get", {
        headers: { Authorization: token },
      });
      if (data.success) {
        dispatch(setTenantBranding(data.tenantBranding));
        return { success: true, user: data.user };
      }
      const unauthorized =
        data.message?.includes("Not authorized") ||
        data.message?.includes("Invalid token");
      return { success: false, unauthorized, message: data.message };
    } catch (error) {
      const unauthorized = error.response?.status === 401;
      return { success: false, unauthorized };
    }
  }
);

export const logoutUser = createAsyncThunk(
  "auth/logout",
  async (_, { dispatch }) => {
    localStorage.removeItem("token");
    dispatch(resetChat());
    dispatch(clearGuestSession());
    dispatch(clearTenantBranding());
    return true;
  }
);

// PATCH /api/user/profile — multipart (name + optional avatar file)
export const updateProfile = createAsyncThunk(
  "auth/updateProfile",
  async ({ name, avatarFile }, { getState }) => {
    const token = getState().auth.token;
    try {
      const fd = new FormData();
      if (name !== undefined) fd.append("name", name);
      if (avatarFile) fd.append("avatar", avatarFile);
      const { data } = await axios.patch("/api/user/profile", fd, {
        headers: {
          Authorization: token,
          "Content-Type": "multipart/form-data",
        },
      });
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to update profile",
      };
    }
  }
);

// PATCH /api/user/profile/details — { core?, career?, studyAbroad?, events?, notifications? }
// The manual-entry path (Rev 5 §5.2 "Path B") for the unified student profile.
export const updateProfileDetails = createAsyncThunk(
  "auth/updateProfileDetails",
  async (body, { getState }) => {
    const token = getState().auth.token;
    try {
      const { data } = await axios.patch("/api/user/profile/details", body, {
        headers: { Authorization: token },
      });
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to update profile details",
      };
    }
  }
);

// POST /api/user/cv/parse — multipart (cv file). Returns the extracted
// CVProfile for the client to show as an editable preview; never persisted
// server-side and never auto-merged into user state — the student still has
// to hit "Save changes" on the profile-details form (Rev 5 §5.2).
export const parseCv = createAsyncThunk(
  "auth/parseCv",
  async (file, { getState }) => {
    const token = getState().auth.token;
    try {
      const fd = new FormData();
      fd.append("cv", file);
      const { data } = await axios.post("/api/user/cv/parse", fd, {
        headers: {
          Authorization: token,
          "Content-Type": "multipart/form-data",
        },
      });
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to parse CV",
      };
    }
  }
);

// POST /api/user/change-password — { currentPassword, newPassword }
export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async ({ currentPassword, newPassword }, { getState }) => {
    const token = getState().auth.token;
    try {
      const { data } = await axios.post(
        "/api/user/change-password",
        { currentPassword, newPassword },
        { headers: { Authorization: token } }
      );
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to change password",
      };
    }
  }
);

const initialState = {
  user: null,
  token: localStorage.getItem("token") || null,
  loadingUser: true,
  // Rev7 §6/T3 — support-access/impersonation. Set only by Super Admin's
  // "Impersonate" action (platformSlice.impersonateTenant); a persistent
  // banner (components/ImpersonationBanner.jsx) reads this so an
  // impersonated session is never visually indistinguishable from a real
  // tenant Administrator login.
  impersonating: false,
  impersonatedTenantName: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setLoadingUser(state, action) {
      state.loadingUser = action.payload;
    },
    startImpersonation(state, action) {
      const { token, user, tenantName } = action.payload;
      localStorage.setItem("token", token);
      state.token = token;
      state.user = user;
      state.loadingUser = false;
      state.impersonating = true;
      state.impersonatedTenantName = tenantName;
    },
    endImpersonation(state) {
      localStorage.removeItem("token");
      state.token = null;
      state.user = null;
      state.impersonating = false;
      state.impersonatedTenantName = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(verifyOtp.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.token = action.payload.token;
          state.user = action.payload.user;
          state.loadingUser = false;
        }
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.token = action.payload.token;
          state.user = action.payload.user;
          state.loadingUser = false;
        }
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.user = action.payload.user;
        } else if (action.payload.unauthorized) {
          state.token = null;
          state.user = null;
        }
        state.loadingUser = false;
      })
      .addCase(fetchUser.rejected, (state) => {
        state.loadingUser = false;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.token = null;
        state.user = null;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.user = action.payload.user;
        }
      })
      .addCase(updateProfileDetails.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.user = action.payload.user;
        }
      });
  },
});

export const { setLoadingUser, startImpersonation, endImpersonation } = authSlice.actions;
export default authSlice.reducer;
