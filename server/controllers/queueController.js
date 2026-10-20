// Walk-in queues for offices (Finance, Registrar, ...): a student joins from
// their phone and sees their place and a rough wait; staff call the next
// person, who is told it's their turn (in-app, email and browser push).
import { notify } from "../services/notify.js";
import { localDayKey } from "../services/dates.js";

const ACTIVE = ["waiting", "called"];
const DEFAULT_SERVICE_MINUTES = 5;

const today = (req) => localDayKey(new Date(), req.tenant?.businessHours?.timezone);
export const ticketLabel = (code, number) => `${code}-${String(number).padStart(3, "0")}`;

// Average minutes from being called to being served, today; a default
// until a few people have been seen.
const serviceMinutes = async (models, department, day) => {
  const served = await models.QueueTicket.find({ department, day, status: "served", calledAt: { $ne: null } }).select("calledAt servedAt");
  if (served.length < 2) return DEFAULT_SERVICE_MINUTES;
  const avg = served.reduce((sum, t) => sum + (t.servedAt - t.calledAt), 0) / served.length / 60000;
  return Math.min(30, Math.max(2, Math.round(avg)));
};

const studentView = async (models, ticket, dept) => {
  const view = {
    _id: ticket._id,
    label: ticketLabel(dept.code, ticket.number),
    department: { _id: dept._id, name: dept.name, code: dept.code, walkInNote: dept.walkInNote || "" },
    status: ticket.status,
    counter: ticket.counter,
    reason: ticket.reason,
    calledAt: ticket.calledAt,
    createdAt: ticket.createdAt,
    ahead: 0,
    estimatedWaitMinutes: 0,
  };
  if (ticket.status === "waiting") {
    view.ahead = await models.QueueTicket.countDocuments({
      department: dept._id,
      day: ticket.day,
      status: "waiting",
      number: { $lt: ticket.number },
    });
    view.estimatedWaitMinutes = view.ahead * (await serviceMinutes(models, dept._id, ticket.day));
  }
  return view;
};

// GET /api/queue/departments — offices that take walk-ins through the app
export const listQueueDepartments = async (req, res) => {
  try {
    const day = today(req);
    const departments = await req.models.Department.find({ isActive: true, walkInEnabled: true }).sort({ name: 1 });
    const out = await Promise.all(
      departments.map(async (d) => {
        const waiting = await req.models.QueueTicket.countDocuments({ department: d._id, day, status: "waiting" });
        return {
          _id: d._id,
          code: d.code,
          name: d.name,
          walkInNote: d.walkInNote || "",
          open: !!d.walkInOpen,
          waiting,
          estimatedWaitMinutes: waiting * (await serviceMinutes(req.models, d._id, day)),
        };
      })
    );
    res.json({ success: true, departments: out });
  } catch (error) {
    console.error("listQueueDepartments error:", error);
    res.status(500).json({ success: false, message: "Failed to load offices" });
  }
};

// GET /api/queue/mine — today's tickets (active first)
export const myQueueTickets = async (req, res) => {
  try {
    const tickets = await req.models.QueueTicket.find({ studentId: req.user._id, day: today(req) }).sort({ createdAt: -1 }).limit(10);
    const departments = await req.models.Department.find({ _id: { $in: tickets.map((t) => t.department) } });
    const byId = new Map(departments.map((d) => [String(d._id), d]));
    const views = await Promise.all(tickets.filter((t) => byId.has(String(t.department))).map((t) => studentView(req.models, t, byId.get(String(t.department)))));
    views.sort((a, b) => Number(ACTIVE.includes(b.status)) - Number(ACTIVE.includes(a.status)));
    res.json({ success: true, tickets: views });
  } catch (error) {
    console.error("myQueueTickets error:", error);
    res.status(500).json({ success: false, message: "Failed to load your place in the queue" });
  }
};

// POST /api/queue/join { departmentId, reason }
export const joinQueue = async (req, res) => {
  const { departmentId } = req.body || {};
  const reason = String(req.body?.reason || "").trim().slice(0, 200);
  try {
    const dept = departmentId && (await req.models.Department.findOne({ _id: departmentId, isActive: true, walkInEnabled: true }).catch(() => null));
    if (!dept) return res.status(404).json({ success: false, message: "That office doesn't take walk-ins through the app" });
    if (!dept.walkInOpen) return res.status(400).json({ success: false, message: `${dept.name} isn't taking walk-ins right now` });
    const day = today(req);
    const current = await req.models.QueueTicket.findOne({ studentId: req.user._id, day, status: { $in: ACTIVE } });
    if (current) {
      const other = current.department.equals(dept._id) ? dept : await req.models.Department.findById(current.department);
      return res.status(400).json({ success: false, message: `You're already in the ${other?.name || "other"} queue — leave it first` });
    }
    let ticket;
    for (let attempt = 0; attempt < 5 && !ticket; attempt += 1) {
      const last = await req.models.QueueTicket.findOne({ department: dept._id, day }).sort({ number: -1 }).select("number");
      try {
        ticket = await req.models.QueueTicket.create({
          department: dept._id,
          studentId: req.user._id,
          studentName: req.user.name,
          studentEmail: req.user.email,
          reason,
          day,
          number: (last?.number || 0) + 1,
        });
      } catch (error) {
        if (error.code !== 11000 || attempt === 4) throw error; // someone took that number — try the next
      }
    }
    res.status(201).json({ success: true, ticket: await studentView(req.models, ticket, dept) });
  } catch (error) {
    console.error("joinQueue error:", error);
    res.status(500).json({ success: false, message: "Couldn't join the queue" });
  }
};

// DELETE /api/queue/:id — leave the queue
export const leaveQueue = async (req, res) => {
  try {
    const ticket = await req.models.QueueTicket.findOneAndUpdate(
      { _id: req.params.id, studentId: req.user._id, status: { $in: ACTIVE } },
      { status: "cancelled" },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, message: "You're not in that queue" });
    res.json({ success: true });
  } catch (error) {
    console.error("leaveQueue error:", error);
    res.status(500).json({ success: false, message: "Couldn't leave the queue" });
  }
};

// ---- staff (own department) ----

const staffDepartment = (req) => req.models.Department.findById(req.user.department);

const tellNextInLine = async (req, dept, day) => {
  const next = await req.models.QueueTicket.findOneAndUpdate(
    { department: dept._id, day, status: "waiting", nextNotifiedAt: null },
    { nextNotifiedAt: new Date() },
    { sort: { number: 1 }, new: true }
  );
  if (!next) return;
  // Only the very first in line, not someone further back.
  const before = await req.models.QueueTicket.countDocuments({ department: dept._id, day, status: "waiting", number: { $lt: next.number } });
  if (before > 0) {
    await req.models.QueueTicket.updateOne({ _id: next._id }, { nextNotifiedAt: null });
    return;
  }
  const student = await req.models.User.findById(next.studentId);
  if (!student) return;
  notify(req.models.Notification, student, {
    type: "queue_update",
    message: `You're next at ${dept.name} (ticket ${ticketLabel(dept.code, next.number)}) — please head over`,
    link: "/queue",
    branding: req.tenant?.branding,
    tenantSlug: req.tenant?.slug,
  }).catch(() => {});
};

const tellTheirTurn = async (req, dept, ticket) => {
  const student = await req.models.User.findById(ticket.studentId);
  if (!student) return;
  const where = ticket.counter ? ` — go to ${ticket.counter}` : "";
  notify(req.models.Notification, student, {
    type: "queue_update",
    message: `It's your turn at ${dept.name} (ticket ${ticketLabel(dept.code, ticket.number)})${where}`,
    link: "/queue",
    branding: req.tenant?.branding,
    tenantSlug: req.tenant?.slug,
  }).catch(() => {});
};

const staffTicketView = (dept, t) => ({
  _id: t._id,
  label: ticketLabel(dept.code, t.number),
  studentName: t.studentName,
  studentEmail: t.studentEmail,
  reason: t.reason,
  status: t.status,
  counter: t.counter,
  createdAt: t.createdAt,
  calledAt: t.calledAt,
  servedAt: t.servedAt,
});

// GET /api/queue/department
export const getDepartmentQueue = async (req, res) => {
  try {
    const dept = await staffDepartment(req);
    if (!dept) return res.status(404).json({ success: false, message: "Department not found" });
    const day = today(req);
    const tickets = await req.models.QueueTicket.find({ department: dept._id, day }).sort({ number: 1 });
    const done = tickets.filter((t) => t.calledAt);
    const avgWait = done.length ? Math.round(done.reduce((s, t) => s + (t.calledAt - t.createdAt), 0) / done.length / 60000) : null;
    res.json({
      success: true,
      department: { _id: dept._id, name: dept.name, code: dept.code, walkInEnabled: !!dept.walkInEnabled, walkInOpen: !!dept.walkInOpen },
      waiting: tickets.filter((t) => t.status === "waiting").map((t) => staffTicketView(dept, t)),
      called: tickets
        .filter((t) => t.status === "called")
        .sort((a, b) => b.calledAt - a.calledAt)
        .map((t) => staffTicketView(dept, t)),
      stats: {
        served: tickets.filter((t) => t.status === "served").length,
        noShow: tickets.filter((t) => t.status === "no_show").length,
        cancelled: tickets.filter((t) => t.status === "cancelled").length,
        avgWaitMinutes: avgWait,
        serviceMinutes: await serviceMinutes(req.models, dept._id, day),
      },
    });
  } catch (error) {
    console.error("getDepartmentQueue error:", error);
    res.status(500).json({ success: false, message: "Failed to load the queue" });
  }
};

// POST /api/queue/department/open { open }
export const setQueueOpen = async (req, res) => {
  try {
    const dept = await staffDepartment(req);
    if (!dept?.walkInEnabled) {
      return res.status(400).json({ success: false, message: "Your department doesn't take walk-ins through the app — an Administrator can turn it on in Departments" });
    }
    dept.walkInOpen = !!req.body?.open;
    await dept.save();
    res.json({ success: true, walkInOpen: dept.walkInOpen });
  } catch (error) {
    console.error("setQueueOpen error:", error);
    res.status(500).json({ success: false, message: "Couldn't change the queue" });
  }
};

// POST /api/queue/department/call-next { counter }
export const callNextInQueue = async (req, res) => {
  const counter = String(req.body?.counter || "").trim().slice(0, 40);
  try {
    const dept = await staffDepartment(req);
    if (!dept) return res.status(404).json({ success: false, message: "Department not found" });
    const day = today(req);
    // Atomic: two people pressing "Call next" at once get different students.
    const ticket = await req.models.QueueTicket.findOneAndUpdate(
      { department: dept._id, day, status: "waiting" },
      { status: "called", calledAt: new Date(), calledBy: req.user._id, counter },
      { sort: { number: 1 }, new: true }
    );
    if (!ticket) return res.json({ success: true, ticket: null, message: "Nobody is waiting" });
    await tellTheirTurn(req, dept, ticket);
    await tellNextInLine(req, dept, day);
    res.json({ success: true, ticket: staffTicketView(dept, ticket) });
  } catch (error) {
    console.error("callNextInQueue error:", error);
    res.status(500).json({ success: false, message: "Couldn't call the next person" });
  }
};

const updateCalled = (next) => async (req, res) => {
  try {
    const dept = await staffDepartment(req);
    if (!dept) return res.status(404).json({ success: false, message: "Department not found" });
    const ticket = await req.models.QueueTicket.findOne({ _id: req.params.id, department: dept._id, status: "called" });
    if (!ticket) return res.status(404).json({ success: false, message: "That ticket isn't being served" });
    if (next === "recall") {
      ticket.calledAt = new Date();
      await ticket.save();
      await tellTheirTurn(req, dept, ticket);
    } else {
      ticket.status = next;
      if (next === "served") ticket.servedAt = new Date();
      await ticket.save();
    }
    res.json({ success: true, ticket: staffTicketView(dept, ticket) });
  } catch (error) {
    console.error("queue ticket update error:", error);
    res.status(500).json({ success: false, message: "Couldn't update the ticket" });
  }
};

// POST /api/queue/department/tickets/:id/{served|no-show|recall}
export const markQueueServed = updateCalled("served");
export const markQueueNoShow = updateCalled("no_show");
export const recallQueueTicket = updateCalled("recall");
