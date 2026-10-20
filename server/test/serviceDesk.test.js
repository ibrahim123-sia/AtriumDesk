// Integration tests for the help-desk lifecycle, answer feedback, guest
// sessions and account data (the October 2026 review). Like
// tenant-isolation.test.js they use the configured MongoDB with a throwaway
// tenant database, and call the controllers directly with a fake req/res.
//
// Run with:  node --test test/serviceDesk.test.js   (from server/)

// Emails go to a closed local port (fails at once) instead of a real relay;
// set before the mailer module reads the environment.
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "1";
process.env.SMTP_USER = "";
process.env.PYTHON_BACKEND_URL = "http://127.0.0.1:1";

const { default: test } = await import("node:test");
const { default: assert } = await import("node:assert/strict");
await import("dotenv/config");
const { default: mongoose } = await import("mongoose");
const { default: bcrypt } = await import("bcryptjs");
const { default: connectDB } = await import("../config/db.js");
const { getTenantConnection } = await import("../config/tenantDb.js");
const { getTenantModels } = await import("../models/registry.js");
const { getTenantModel } = await import("../models/platform/Tenant.js");
const { invalidateTenantCache } = await import("../services/tenantRegistry.js");
const issues = await import("../controllers/issueController.js");
const { submitAnswerFeedback } = await import("../controllers/chatController.js");
const { exportMyData, deleteMyAccount } = await import("../controllers/accountDataController.js");
const { guestTextChatController, clearGuestSession } = await import("../controllers/guestChatController.js");
const { runAutoCloseResolvedIssues, runKnowledgeBaseRefresh, runSavedSearchAlerts } = await import("../services/scheduler.js");
const savedSearches = await import("../controllers/savedSearchController.js");
const { textMessageController } = await import("../controllers/messageController.js");
const { updateTenantSettings } = await import("../controllers/tenantSettingsController.js");
const rsvps = await import("../controllers/eventRsvpController.js");
const { deleteListing } = await import("../controllers/adminListingController.js");

const DB = "test_service_desk";
const SLUG = "test-service-desk";
let tenantDoc, models, tenant, deptA, deptB, staffA, staffB, student;

const call = async (handler, req) => {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  };
  await handler({ params: {}, query: {}, body: {}, models, tenant, headers: {}, ...req }, res);
  return res;
};

// Notifications are sent without awaiting; give them a moment to land.
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

const fileIssue = (overrides = {}) =>
  models.Issue.create({
    studentId: student._id,
    studentName: student.name,
    studentEmail: student.email,
    department: deptA._id,
    title: "Fee challan missing",
    description: "I never received my fee challan.",
    ...overrides,
  });

test.before(async () => {
  await connectDB();
  tenantDoc = await getTenantModel().create({
    slug: SLUG,
    name: "Service Desk Test University",
    status: "active",
    dbName: DB,
    chromaCollection: "chunks_test_service_desk",
    emailDomains: ["sdtest.invalid"],
    branding: { universityName: "Service Desk Test University", universityShort: "SDTU" },
  });
  invalidateTenantCache();
  tenant = tenantDoc.toObject();
  models = getTenantModels(getTenantConnection(DB));
  deptA = await models.Department.create({ code: "FIN", name: "Finance" });
  deptB = await models.Department.create({ code: "REG", name: "Registrar" });
  const password = await bcrypt.hash("Secret123", 10);
  staffA = await models.User.create({ name: "Fin Staff", email: "fin@sdtest.invalid", password, role: "staff", isVerified: true, department: deptA._id });
  staffB = await models.User.create({ name: "Reg Staff", email: "reg@sdtest.invalid", password, role: "staff", isVerified: true, department: deptB._id });
  student = await models.User.create({ name: "Test Student", email: "student@sdtest.invalid", password, role: "student", isVerified: true });
});

test.after(async () => {
  await settle();
  await getTenantConnection(DB).dropDatabase();
  await getTenantModel().deleteOne({ _id: tenantDoc._id });
  invalidateTenantCache();
  await mongoose.disconnect();
});

test("internal notes reach staff views only", async () => {
  const issue = await fileIssue();
  const added = await call(issues.addInternalNote, { user: staffA, params: { id: String(issue._id) }, body: { message: "Called the bank." } });
  assert.equal(added.statusCode, 201);
  assert.equal(added.body.issue.internalNotes.length, 1);

  const studentView = await call(issues.getMyIssueById, { user: student, params: { id: String(issue._id) } });
  assert.equal(studentView.statusCode, 200);
  assert.equal(studentView.body.issue.toObject().internalNotes, undefined);

  const staffView = await call(issues.getDeptIssueById, { user: staffA, params: { id: String(issue._id) } });
  assert.equal(staffView.body.issue.internalNotes[0].message, "Called the bank.");

  const otherDept = await call(issues.addInternalNote, { user: staffB, params: { id: String(issue._id) }, body: { message: "x" } });
  assert.equal(otherDept.statusCode, 403);
});

test("a student reply reopens a resolved issue and tells the assignee; closed issues refuse replies", async () => {
  const issue = await fileIssue({ status: "Resolved", assignedTo: staffA._id, resolvedAt: new Date() });
  const reply = await call(issues.addStudentReply, { user: student, params: { id: String(issue._id) }, body: { message: "Still not received." } });
  assert.equal(reply.statusCode, 200);
  assert.equal(reply.body.reopened, true);
  assert.equal(reply.body.issue.status, "In Progress");
  assert.equal(reply.body.issue.lastEvent.type, "reopen");
  await settle();
  const told = await models.Notification.find({ issueId: issue._id });
  assert.deepEqual(told.map((n) => String(n.userId)), [String(staffA._id)], "only the assignee is notified");

  await models.Issue.updateOne({ _id: issue._id }, { status: "Closed" });
  const closed = await call(issues.addStudentReply, { user: student, params: { id: String(issue._id) }, body: { message: "hello?" } });
  assert.equal(closed.statusCode, 400);
});

test("transfer moves an issue to the right department and teaches the suggestion", async () => {
  const issue = await fileIssue({ title: "Transcript request", assignedTo: staffA._id, escalated: true });
  const same = await call(issues.transferIssue, { user: staffA, params: { id: String(issue._id) }, body: { departmentId: String(deptA._id) } });
  assert.equal(same.statusCode, 400);

  const moved = await call(issues.transferIssue, {
    user: staffA,
    params: { id: String(issue._id) },
    body: { departmentId: String(deptB._id), note: "Registrar issues transcripts" },
  });
  assert.equal(moved.statusCode, 200);
  assert.equal(moved.body.transferredTo.code, "REG");

  const after = await models.Issue.findById(issue._id).select("+internalNotes");
  assert.equal(String(after.department), String(deptB._id));
  assert.equal(after.assignedTo, null);
  assert.equal(after.escalated, false);
  assert.match(after.internalNotes.at(-1).message, /Transferred from FIN to REG: Registrar issues transcripts/);
  const example = await models.DepartmentExample.findOne({ question: "Transcript request" });
  assert.equal(String(example.departmentId), String(deptB._id));
  assert.equal(String(example.suggestedDepartmentId), String(deptA._id));

  const oldDept = await call(issues.getDeptIssueById, { user: staffA, params: { id: String(issue._id) } });
  assert.equal(oldDept.statusCode, 403);

  const resolved = await fileIssue({ status: "Resolved" });
  const refused = await call(issues.transferIssue, { user: staffA, params: { id: String(resolved._id) }, body: { departmentId: String(deptB._id) } });
  assert.equal(refused.statusCode, 400);
});

test("inbox counts cover every status whichever tab is open", async () => {
  const res = await call(issues.getDeptIssues, { user: staffA, query: { status: "Pending" } });
  const real = await models.Issue.aggregate([{ $match: { department: deptA._id } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  for (const row of real) assert.equal(res.body.counts[row._id], row.n);
  assert.equal(res.body.counts.All, real.reduce((sum, row) => sum + row.n, 0));
  assert.ok(res.body.issues.every((i) => i.status === "Pending"));
});

test("auto-close closes only issues resolved and untouched for 7 days", async () => {
  // Dated 2020 and run "as of" 2020, so no real tenant's issue can qualify.
  const old = new Date("2020-01-01T00:00:00Z");
  const stale = await fileIssue({ status: "Resolved", resolvedAt: old });
  await models.Issue.collection.updateOne({ _id: stale._id }, { $set: { updatedAt: old } });
  const fresh = await fileIssue({ status: "Resolved", resolvedAt: new Date() });

  const closed = await runAutoCloseResolvedIssues(new Date("2020-01-09T00:00:00Z"));
  assert.equal(closed, 1);
  assert.equal((await models.Issue.findById(stale._id)).status, "Closed");
  assert.equal((await models.Issue.findById(fresh._id)).status, "Resolved");
});

test("a thumbs-down logs the question once, with the answer it got", async () => {
  const chat = await models.Chat.create({
    userId: student._id,
    userName: student.name,
    name: "Fees",
    messages: [
      { type: "text", role: "user", content: "What is the hostel fee?", timestamp: Date.now() },
      { type: "text", role: "assistant", content: "I don't have that.", confidenceTier: "low", timestamp: Date.now() },
    ],
  });
  const answerId = String(chat.messages[1]._id);
  const params = { chatId: String(chat._id), messageId: answerId };
  const down = await call(submitAnswerFeedback, { user: student, params, body: { helpful: false } });
  assert.equal(down.statusCode, 200);
  await call(submitAnswerFeedback, { user: student, params, body: { helpful: true } });
  await call(submitAnswerFeedback, { user: student, params, body: { helpful: false } });

  const logged = await models.FailedQuestion.find({ question: "What is the hostel fee?" });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].reason, "unhelpful");
  assert.equal(logged[0].answer, "I don't have that.");
  assert.equal(await models.AnswerFeedback.countDocuments({ chatId: chat._id }), 1);

  const notMine = await call(submitAnswerFeedback, { user: staffA, params, body: { helpful: false } });
  assert.equal(notMine.statusCode, 404);
});

test("first-time guests get their own session; made-up ids are replaced", async () => {
  const a = await call(guestTextChatController, { body: { message: "hi", sessionId: null, tenant: SLUG }, ip: "127.0.0.1" });
  const b = await call(guestTextChatController, { body: { message: "hello", sessionId: null, tenant: SLUG }, ip: "127.0.0.1" });
  const c = await call(guestTextChatController, { body: { message: "hey", sessionId: "made-up", tenant: SLUG }, ip: "127.0.0.1" });
  const ids = [a.body.sessionId, b.body.sessionId, c.body.sessionId];
  for (const id of ids) assert.match(id, /^guest_[0-9a-f]{32}$/);
  assert.equal(new Set(ids).size, 3);

  const again = await call(guestTextChatController, { body: { message: "more", sessionId: a.body.sessionId, tenant: SLUG }, ip: "127.0.0.1" });
  assert.equal(again.body.sessionId, a.body.sessionId);
  assert.equal(again.body.reply.answerIndex, 3);
  for (const id of ids) await call(clearGuestSession, { body: { sessionId: id } });
});

test("data export holds the student's records without secrets or staff notes", async () => {
  const issue = await fileIssue({ title: "Export me" });
  await models.Issue.updateOne({ _id: issue._id }, { $push: { internalNotes: { authorId: staffA._id, authorName: "Fin Staff", message: "STAFF ONLY" } } });
  const res = await call(exportMyData, { user: student });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-disposition"], /attachment; filename="my-data-/);
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes("STAFF ONLY"));
  assert.ok(!text.includes("$2a$") && !text.includes("$2b$"), "no password hash");
  assert.ok(res.body.issues.some((i) => i.title === "Export me"));
});

test("account deletion: students only, password required, issues kept without the name", async () => {
  const doomed = await models.User.create({
    name: "Leaving Student",
    email: "leaving@sdtest.invalid",
    password: await bcrypt.hash("Bye12345", 10),
    role: "student",
    isVerified: true,
  });
  const issue = await models.Issue.create({
    studentId: doomed._id, studentName: doomed.name, studentEmail: doomed.email, department: deptA._id,
    title: "Before leaving", description: "x",
    replies: [{ authorId: doomed._id, authorName: doomed.name, authorRole: "student", message: "any update?" }],
  });
  await models.Chat.create({ userId: doomed._id, userName: doomed.name, name: "Bye", messages: [] });

  assert.equal((await call(deleteMyAccount, { user: staffA, body: { password: "Secret123" } })).statusCode, 403);
  assert.equal((await call(deleteMyAccount, { user: doomed, body: {} })).statusCode, 400);
  assert.equal((await call(deleteMyAccount, { user: doomed, body: { password: "wrong" } })).statusCode, 401);
  assert.ok(await models.User.findById(doomed._id));

  const ok = await call(deleteMyAccount, { user: doomed, body: { password: "Bye12345" } });
  assert.equal(ok.statusCode, 200);
  assert.equal(await models.User.findById(doomed._id), null);
  assert.equal(await models.Chat.countDocuments({ userId: doomed._id }), 0);
  const kept = await models.Issue.findById(issue._id);
  assert.equal(kept.studentName, "Deleted student");
  assert.equal(kept.studentEmail, "deleted-account");
  assert.equal(kept.replies[0].authorName, "Deleted student");
});

test("someone who may be in crisis gets the support reply, not a model answer", async () => {
  await getTenantModel().updateOne({ _id: tenantDoc._id }, { "branding.wellbeingMessage": "Counselling Centre, Room 12 — counselling@sdtest.invalid" });
  const chat = await models.Chat.create({ userId: student._id, userName: student.name, name: "New Chat", messages: [] });
  const t = { ...tenant, branding: { ...tenant.branding, wellbeingMessage: "Counselling Centre, Room 12 — counselling@sdtest.invalid" } };
  const res = await call(textMessageController, { user: student, tenant: t, body: { chatId: String(chat._id), prompt: "I don't want to live anymore" } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply.safety, "wellbeing");
  assert.match(res.body.reply.content, /Counselling Centre, Room 12/);
  assert.equal(await models.FailedQuestion.countDocuments({ question: "I don't want to live anymore" }), 0);
  assert.equal(await models.AiUsageLog.countDocuments({ userId: student._id, endpoint: "chat" }), 0, "no model call");
  const rate = await call(submitAnswerFeedback, {
    user: student,
    params: { chatId: String(chat._id), messageId: String(res.body.reply._id) },
    body: { helpful: false },
  });
  assert.equal(rate.statusCode, 400, "support replies can't be rated into the failed-question log");

  const empty = await call(textMessageController, { user: student, body: { chatId: String(chat._id), prompt: "   " } });
  assert.equal(empty.statusCode, 400);
});

test("a reply draft fails cleanly when the AI service is unavailable", async () => {
  const issue = await fileIssue({ title: "Draft me" });
  const res = await call(issues.draftStaffReply, { user: staffA, params: { id: String(issue._id) } });
  assert.equal(res.statusCode, 502);
  assert.match(res.body.message, /Couldn't draft a reply/);
  const other = await call(issues.draftStaffReply, { user: staffB, params: { id: String(issue._id) } });
  assert.equal(other.statusCode, 403);
});

test("working hours and the knowledge-base refresh are validated and scheduled", async () => {
  const admin = { _id: new mongoose.Types.ObjectId(), role: "admin" };
  const bad = await call(updateTenantSettings, { user: admin, tenant: { ...tenant, _id: tenantDoc._id }, body: { businessHours: { enabled: true, days: [1], startHour: 17, endHour: 9 } } });
  assert.equal(bad.statusCode, 400);
  const badZone = await call(updateTenantSettings, { user: admin, tenant: { ...tenant, _id: tenantDoc._id }, body: { businessHours: { enabled: true, timezone: "Mars/Base" } } });
  assert.equal(badZone.statusCode, 400);
  const ok = await call(updateTenantSettings, {
    user: admin,
    tenant: { ...tenant, _id: tenantDoc._id },
    body: { businessHours: { enabled: true, days: [5, 1, 1, 2], startHour: 8, endHour: 16, timezone: "Asia/Karachi" } },
  });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual([...ok.body.tenant.businessHours.days], [1, 2, 5]);

  // Due for a refresh: last run 8 days ago, weekly schedule. The AI service is
  // down in tests, so the run is started and then marked failed.
  await getTenantModel().updateOne(
    { _id: tenantDoc._id },
    { contentSource: { sitemapUrl: "https://sdtest.invalid/sitemap.xml", allowedDomain: "sdtest.invalid", baseUrl: "https://sdtest.invalid", status: "done", completedAt: new Date(Date.now() - 8 * 86400000), refreshDays: 7 } }
  );
  const started = await runKnowledgeBaseRefresh();
  assert.ok(started >= 1);
  const after = await getTenantModel().findById(tenantDoc._id);
  assert.ok(["running", "failed"].includes(after.contentSource.status));
  assert.equal(after.contentSource.refreshDays, 7, "the schedule survives the run");
  // Not due again right away.
  await getTenantModel().updateOne({ _id: tenantDoc._id }, { "contentSource.status": "done", "contentSource.completedAt": new Date() });
  const again = await runKnowledgeBaseRefresh();
  const mine = await getTenantModel().findById(tenantDoc._id);
  assert.equal(mine.contentSource.status, "done", `not re-run (${again})`);
});

test("RSVPs fill the places, then a waitlist that moves up when someone cancels", async () => {
  const password = await bcrypt.hash("Secret123", 10);
  const [a, b, c] = await Promise.all(
    ["a", "b", "c"].map((n) =>
      models.User.create({ name: `Attendee ${n.toUpperCase()}`, email: `rsvp-${n}@sdtest.invalid`, password, role: "student", isVerified: true })
    )
  );
  const Event = models.Listing.discriminators.event;
  const event = await Event.create({
    listingType: "event", title: "Career Fair", organization: "Careers Office", date: new Date(Date.now() + 3 * 86400000),
    status: "approved", source: "manual", rsvpEnabled: true, rsvpCapacity: 2,
  });
  const params = { id: String(event._id) };
  const ra = await call(rsvps.rsvpToEvent, { user: a, params });
  const rb = await call(rsvps.rsvpToEvent, { user: b, params });
  const rc = await call(rsvps.rsvpToEvent, { user: c, params });
  assert.equal(ra.body.rsvp.status, "going");
  assert.match(ra.body.rsvp.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(rb.body.rsvp.status, "going");
  assert.equal(rc.body.rsvp.status, "waitlist");
  assert.equal(rc.body.rsvp.code, null, "no door code while waitlisted");
  const cView = await call(rsvps.getMyRsvp, { user: c, params });
  assert.equal(cView.body.rsvp.waitlistPosition, 1);
  assert.ok(await models.SavedListing.exists({ userId: a._id, listingId: event._id }), "going also turns the reminder on");

  assert.equal((await call(rsvps.rsvpToEvent, { user: staffA, params })).statusCode, 403);

  // Check-in at the door: by code, idempotent; a waitlisted RSVP can't.
  const code = ra.body.rsvp.code;
  const inA = await call(rsvps.checkInRsvp, { user: staffA, params, body: { code: code.toLowerCase() } });
  assert.equal(inA.statusCode, 200);
  assert.equal(inA.body.attendee.userName, "Attendee A");
  assert.equal((await call(rsvps.checkInRsvp, { user: staffA, params, body: { code } })).body.already, true);
  const cRsvp = await models.EventRsvp.findOne({ eventId: event._id, userId: c._id });
  assert.equal((await call(rsvps.checkInRsvp, { user: staffA, params, body: { rsvpId: String(cRsvp._id) } })).statusCode, 400);
  assert.equal((await call(rsvps.checkInRsvp, { user: staffA, params, body: { code: "ZZZZZZ" } })).statusCode, 404);

  // B can't make it: C moves up and is told.
  const cancel = await call(rsvps.cancelRsvp, { user: b, params });
  assert.equal(cancel.statusCode, 200);
  const promoted = await call(rsvps.getMyRsvp, { user: c, params });
  assert.equal(promoted.body.rsvp.status, "going");
  assert.match(promoted.body.rsvp.code, /^[A-HJ-NP-Z2-9]{6}$/);
  await settle();
  assert.ok(await models.Notification.exists({ userId: c._id, message: /place opened up/ }));

  // B changes their mind: back of the queue (full again → waitlist).
  const back = await call(rsvps.rsvpToEvent, { user: b, params });
  assert.equal(back.body.rsvp.status, "waitlist");

  const list = await call(rsvps.listEventRsvps, { user: staffA, params });
  assert.equal(list.body.going, 2);
  assert.equal(list.body.checkedIn, 1);
  assert.equal(list.body.waitlist, 1);

  // Deleting the event tells everyone holding a place, and drops the RSVPs.
  const removed = await call(deleteListing, { user: staffA, params });
  assert.equal(removed.statusCode, 200);
  assert.equal(await models.EventRsvp.countDocuments({ eventId: event._id }), 0);
  assert.equal(await models.Notification.countDocuments({ message: '"Career Fair" has been cancelled' }), 3);

  const past = await Event.create({
    listingType: "event", title: "Yesterday", organization: "X", date: new Date(Date.now() - 2 * 86400000),
    status: "approved", source: "manual", rsvpEnabled: true,
  });
  assert.equal((await call(rsvps.rsvpToEvent, { user: a, params: { id: String(past._id) } })).statusCode, 400);
});

test("saved searches alert a student once about new matching listings", async () => {
  const bad = await call(savedSearches.createSavedSearch, { user: student, body: { listingType: "event", filters: { search: "x" } } });
  assert.equal(bad.statusCode, 400);
  const empty = await call(savedSearches.createSavedSearch, { user: student, body: { listingType: "job", filters: { search: "  " } } });
  assert.equal(empty.statusCode, 400);

  const made = await call(savedSearches.createSavedSearch, {
    user: student,
    body: { listingType: "scholarship", filters: { search: "Erasmus", scope: "external", junk: "dropped" } },
  });
  assert.equal(made.statusCode, 201);
  assert.deepEqual(made.body.search.filters, { search: "Erasmus", scope: "external" });
  assert.equal(made.body.search.label, 'Scholarships: "Erasmus", study abroad');
  const dup = await call(savedSearches.createSavedSearch, {
    user: student,
    body: { listingType: "scholarship", filters: { search: "Erasmus", scope: "external" } },
  });
  assert.equal(dup.body.already, true);

  // Dated in 2020 so the run can't pick up (or move) real tenants' alerts.
  await models.SavedSearch.updateOne({ _id: made.body.search._id }, { lastCheckedAt: new Date("2019-12-31T00:00:00Z") });
  const Scholarship = models.Listing.discriminators.scholarship;
  const base = { listingType: "scholarship", organization: "EU", status: "approved", source: "manual", scope: "external" };
  await Scholarship.create({ ...base, title: "Erasmus Mundus Joint Masters", approvedAt: new Date("2020-01-01T10:00:00Z") });
  await Scholarship.create({ ...base, title: "Chevening", approvedAt: new Date("2020-01-01T11:00:00Z") });
  await Scholarship.create({ ...base, title: "Erasmus internal", scope: "internal", approvedAt: new Date("2020-01-01T12:00:00Z") });

  const sent = await runSavedSearchAlerts(new Date("2020-01-02T00:00:00Z"));
  assert.ok(sent >= 1);
  await settle();
  const notes = await models.Notification.find({ userId: student._id, message: /alert/ });
  assert.equal(notes.length, 1);
  assert.match(notes[0].message, /^1 new scholarship for your alert/);
  assert.match(notes[0].link, /^\/scholarships\/[0-9a-f]{24}$/);

  await runSavedSearchAlerts(new Date("2020-01-03T00:00:00Z"));
  await settle();
  assert.equal(await models.Notification.countDocuments({ userId: student._id, message: /alert/ }), 1, "nothing new, no second alert");

  const list = await call(savedSearches.listSavedSearches, { user: student });
  assert.equal(list.body.searches.length, 1);
  assert.equal((await call(savedSearches.deleteSavedSearch, { user: staffA, params: { id: String(made.body.search._id) } })).statusCode, 404);
  assert.equal((await call(savedSearches.deleteSavedSearch, { user: student, params: { id: String(made.body.search._id) } })).statusCode, 200);
});

