import { combineReducers, configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import chatReducer from "./slices/chatSlice";
import guestReducer from "./slices/guestSlice";
import themeReducer from "./slices/themeSlice";
import issueReducer from "./slices/issueSlice";
import notificationReducer from "./slices/notificationSlice";
import departmentReducer from "./slices/departmentSlice";
import adminStatsReducer from "./slices/adminStatsSlice";
import adminUserReducer from "./slices/adminUserSlice";
import adminStaffReducer from "./slices/adminStaffSlice";
import adminQueryReducer from "./slices/adminQuerySlice";
import adminDataReducer from "./slices/adminDataSlice";
import adminLogReducer from "./slices/adminLogSlice";
import adminFailedQuestionsReducer from "./slices/adminFailedQuestionsSlice";
import adminListingReducer from "./slices/adminListingSlice";
import adminSourceReducer from "./slices/adminSourceSlice";
import adminActivityReducer from "./slices/adminActivitySlice";
import scholarshipReducer from "./slices/scholarshipSlice";
import jobReducer from "./slices/jobSlice";
import eventReducer from "./slices/eventSlice";
import tenantReducer from "./slices/tenantSlice";
import savedReducer from "./slices/savedSlice";
import platformAuthReducer from "./slices/platformAuthSlice";
import platformReducer from "./slices/platformSlice";

const appReducer = combineReducers({
  auth: authReducer,
  chat: chatReducer,
  guest: guestReducer,
  theme: themeReducer,
  issue: issueReducer,
  notification: notificationReducer,
  department: departmentReducer,
  adminStats: adminStatsReducer,
  adminUser: adminUserReducer,
  adminStaff: adminStaffReducer,
  adminQuery: adminQueryReducer,
  adminData: adminDataReducer,
  adminLog: adminLogReducer,
  adminFailedQuestions: adminFailedQuestionsReducer,
  adminListing: adminListingReducer,
  adminSource: adminSourceReducer,
  adminActivity: adminActivityReducer,
  scholarship: scholarshipReducer,
  job: jobReducer,
  event: eventReducer,
  tenant: tenantReducer,
  saved: savedReducer,
  platformAuth: platformAuthReducer,
  platform: platformReducer,
});

// Signing out returns every tenant-side slice to its initial state, so the
// next person on a shared computer never sees the previous user's issues,
// chats or notifications while their own load. Theme and the separate
// Super Admin session are kept.
const rootReducer = (state, action) => {
  if (action.type === "auth/logout/fulfilled" && state) {
    const { theme, platformAuth, platform } = state;
    return appReducer({ theme, platformAuth, platform }, action);
  }
  return appReducer(state, action);
};

export const store = configureStore({ reducer: rootReducer });
