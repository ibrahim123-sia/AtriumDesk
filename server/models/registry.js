import { getTenantConnection } from "../config/tenantDb.js";
import { departmentSchema } from "./Department.js";
import { auditLogSchema } from "./AuditLog.js";
import { loginEventSchema } from "./LoginEvent.js";
import { userSchema } from "./User.js";
import { issueSchema } from "./Issue.js";
import { chatSchema } from "./Chat.js";
import { notificationSchema } from "./Notification.js";
import { departmentExampleSchema } from "./DepartmentExample.js";
import { failedQuestionSchema } from "./FailedQuestion.js";
import { sourceSchema } from "./Source.js";
import { matchExplanationSchema } from "./MatchExplanation.js";
import { savedListingSchema } from "./SavedListing.js";
import { aiUsageLogSchema } from "./AiUsageLog.js";
import { activityTabSchema } from "./ActivityTab.js";
import { getListingModel, getScholarshipModel, getJobModel, getEventModel } from "./Listing.js";

// Compiles (or reuses an already-compiled) model on a given tenant Connection.
// Registration order matters: models with no ref to another tenant model
// first, then User, then the models that `ref: "User"` — Mongoose's
// populate() resolves a ref string via connection.model(refName), so the
// referenced model must exist on the SAME connection before it's needed.
const getOrCreateModel = (connection, name, schema) => {
  if (connection.models[name]) return connection.models[name];
  return connection.model(name, schema);
};

export const getTenantModels = (connection) => {
  const Department = getOrCreateModel(connection, "Department", departmentSchema);
  const AuditLog = getOrCreateModel(connection, "AuditLog", auditLogSchema);
  const LoginEvent = getOrCreateModel(connection, "LoginEvent", loginEventSchema);
  const User = getOrCreateModel(connection, "User", userSchema);
  const Issue = getOrCreateModel(connection, "Issue", issueSchema);
  const Chat = getOrCreateModel(connection, "Chat", chatSchema);
  const Notification = getOrCreateModel(connection, "Notification", notificationSchema);
  const DepartmentExample = getOrCreateModel(connection, "DepartmentExample", departmentExampleSchema);
  const FailedQuestion = getOrCreateModel(connection, "FailedQuestion", failedQuestionSchema);
  const Source = getOrCreateModel(connection, "Source", sourceSchema);
  const MatchExplanation = getOrCreateModel(connection, "MatchExplanation", matchExplanationSchema);
  const SavedListing = getOrCreateModel(connection, "SavedListing", savedListingSchema);
  const AiUsageLog = getOrCreateModel(connection, "AiUsageLog", aiUsageLogSchema);
  const ActivityTab = getOrCreateModel(connection, "ActivityTab", activityTabSchema);
  // Discriminator models — must attach to the SAME base Listing model
  // instance on this connection, so getListingModel/get*Model are called
  // directly rather than through getOrCreateModel (see models/Listing.js).
  const Listing = getListingModel(connection);
  const Scholarship = getScholarshipModel(connection);
  const Job = getJobModel(connection);
  const Event = getEventModel(connection);
  return {
    Department, AuditLog, LoginEvent, User, Issue, Chat, Notification,
    DepartmentExample, FailedQuestion, Source, MatchExplanation, SavedListing, AiUsageLog, ActivityTab, Listing, Scholarship, Job, Event,
  };
};

// The tenant-doc → models composition every no-middleware caller (guest
// endpoints, internal webhooks, auth flows) needs. One home, so a future
// step in tenant DB acquisition (health check, metrics) lands everywhere.
export const getModelsForTenant = (tenant) =>
  getTenantModels(getTenantConnection(tenant.dbName));
