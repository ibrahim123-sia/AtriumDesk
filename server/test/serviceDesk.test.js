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
const { runAutoCloseResolvedIssues } = await import("../services/scheduler.js");

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
