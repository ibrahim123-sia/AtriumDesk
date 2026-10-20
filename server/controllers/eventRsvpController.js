// RSVPs for campus events: a place (or a waitlist spot when the event is
// full), a check-in code for the door, and automatic promotion from the
// waitlist when someone cancels.
import crypto from "crypto";
import { notify, safeHtml } from "../services/notify.js";
import { startOfToday } from "../services/dates.js";

// No 0/O or 1/I — read off a phone screen at a door.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");

const loadEvent = (models, id) => models.Listing.findOne({ _id: id, listingType: "event", status: "approved" });

const counts = async (models, eventId) => {
  const [going, waitlist, checkedIn] = await Promise.all([
    models.EventRsvp.countDocuments({ eventId, status: "going" }),
    models.EventRsvp.countDocuments({ eventId, status: "waitlist" }),
    models.EventRsvp.countDocuments({ eventId, status: "going", checkedInAt: { $ne: null } }),
  ]);
  return { going, waitlist, checkedIn };
};

// A place is decided by order of RSVP: within capacity → going, otherwise
// waitlist. Recomputed after every change, so two RSVPs racing for the last
// place can't both get it.
const settlePlaces = async (models, event) => {
  const capacity = event.rsvpCapacity;
  const active = await models.EventRsvp.find({ eventId: event._id, status: { $in: ["going", "waitlist"] } }).sort({ createdAt: 1, _id: 1 });
  const promoted = [];
  for (const [index, rsvp] of active.entries()) {
    const shouldGo = !capacity || index < capacity;
    const next = shouldGo ? "going" : "waitlist";
    if (rsvp.status !== next) {
      if (rsvp.status === "waitlist" && next === "going") promoted.push(rsvp);
      rsvp.status = next;
      await rsvp.save();
    }
  }
  return promoted;
};

// After places free up: settle, and tell anyone who moved off the waitlist.
export const fillFreedPlaces = async (models, event, tenant) => {
  const promoted = await settlePlaces(models, event);
  for (const moved of promoted) {
    const student = await models.User.findById(moved.userId);
    if (!student) continue;
    notify(models.Notification, student, {
      type: "listing_saved_change",
      message: `A place opened up — you're going to "${event.title}"`,
      link: `/events/${event._id}`,
      emailSubject: `You have a place at ${event.title}`,
      emailHeading: "A place opened up for you",
      emailBody: safeHtml`You were on the waitlist for <strong>${event.title}</strong> and now have a place. Your check-in code is in the app.`,
      branding: tenant?.branding,
      tenantSlug: tenant?.slug,
    }).catch(() => {});
  }
};

const myView = (rsvp, event, c) => ({
  status: rsvp?.status && rsvp.status !== "cancelled" ? rsvp.status : null,
  code: rsvp?.status === "going" ? rsvp.code : null,
  checkedIn: !!rsvp?.checkedInAt,
  waitlistPosition: null,
  capacity: event.rsvpCapacity || null,
  ...c,
});

// GET /api/events/:id/rsvp
export const getMyRsvp = async (req, res) => {
  try {
    const event = await loadEvent(req.models, req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!event.rsvpEnabled) return res.json({ success: true, rsvp: null });
    const rsvp = await req.models.EventRsvp.findOne({ eventId: event._id, userId: req.user._id });
    const view = myView(rsvp, event, await counts(req.models, event._id));
    if (rsvp?.status === "waitlist") {
      view.waitlistPosition =
        (await req.models.EventRsvp.countDocuments({ eventId: event._id, status: "waitlist", createdAt: { $lt: rsvp.createdAt } })) + 1;
    }
    res.json({ success: true, rsvp: view });
  } catch (error) {
    console.error("getMyRsvp error:", error);
    res.status(500).json({ success: false, message: "Failed to load your RSVP" });
  }
};

// POST /api/events/:id/rsvp — take a place (or join the waitlist)
export const rsvpToEvent = async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ success: false, message: "Only students can RSVP" });
  try {
    const event = await loadEvent(req.models, req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!event.rsvpEnabled) return res.status(400).json({ success: false, message: "This event doesn't take RSVPs" });
    if (event.date < startOfToday()) return res.status(400).json({ success: false, message: "This event has already happened" });

    let rsvp = await req.models.EventRsvp.findOne({ eventId: event._id, userId: req.user._id });
    if (rsvp && rsvp.status !== "cancelled") {
      return res.json({ success: true, rsvp: myView(rsvp, event, await counts(req.models, event._id)) });
    }
    if (rsvp) {
      // Re-joining after cancelling goes to the back of the queue.
      await req.models.EventRsvp.deleteOne({ _id: rsvp._id });
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rsvp = await req.models.EventRsvp.create({
          eventId: event._id,
          userId: req.user._id,
          userName: req.user.name,
          userEmail: req.user.email,
          status: "going",
          code: newCode(),
        });
        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 4) throw error;
        if (await req.models.EventRsvp.exists({ eventId: event._id, userId: req.user._id })) break;
      }
    }
    await settlePlaces(req.models, event);
    rsvp = await req.models.EventRsvp.findOne({ eventId: event._id, userId: req.user._id });

    // Going also means "remind me" (the day-before reminder for saved items).
    await req.models.SavedListing.updateOne(
      { userId: req.user._id, listingId: event._id },
      { $setOnInsert: { userId: req.user._id, listingId: event._id, listingType: "event" } },
      { upsert: true }
    ).catch(() => {});

    res.status(201).json({ success: true, rsvp: myView(rsvp, event, await counts(req.models, event._id)) });
  } catch (error) {
    console.error("rsvpToEvent error:", error);
    res.status(500).json({ success: false, message: "Failed to RSVP" });
  }
};

// DELETE /api/events/:id/rsvp — give up the place
export const cancelRsvp = async (req, res) => {
  try {
    const event = await loadEvent(req.models, req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    const rsvp = await req.models.EventRsvp.findOne({ eventId: event._id, userId: req.user._id, status: { $ne: "cancelled" } });
    if (!rsvp) return res.status(404).json({ success: false, message: "You haven't RSVP'd to this event" });
    rsvp.status = "cancelled";
    await rsvp.save();
    await fillFreedPlaces(req.models, event, req.tenant);
    res.json({ success: true, rsvp: myView(null, event, await counts(req.models, event._id)) });
  } catch (error) {
    console.error("cancelRsvp error:", error);
    res.status(500).json({ success: false, message: "Failed to cancel" });
  }
};

// GET /api/admin/listings/:id/rsvps — the attendee list (content permission)
export const listEventRsvps = async (req, res) => {
  try {
    const event = await req.models.Listing.findOne({ _id: req.params.id, listingType: "event" });
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    const rsvps = await req.models.EventRsvp.find({ eventId: event._id, status: { $ne: "cancelled" } })
      .sort({ status: 1, createdAt: 1 })
      .select("userName userEmail status code checkedInAt createdAt");
    res.json({ success: true, rsvps, capacity: event.rsvpCapacity || null, ...(await counts(req.models, event._id)) });
  } catch (error) {
    console.error("listEventRsvps error:", error);
    res.status(500).json({ success: false, message: "Failed to load attendees" });
  }
};

// POST /api/admin/listings/:id/rsvps/check-in { code } or { rsvpId }
export const checkInRsvp = async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const { rsvpId } = req.body || {};
  if (!code && !rsvpId) return res.status(400).json({ success: false, message: "Enter the attendee's code" });
  try {
    const filter = { eventId: req.params.id, status: { $ne: "cancelled" } };
    if (rsvpId) filter._id = rsvpId;
    else filter.code = code;
    const rsvp = await req.models.EventRsvp.findOne(filter);
    if (!rsvp) return res.status(404).json({ success: false, message: "No RSVP with that code for this event" });
    if (rsvp.status !== "going") return res.status(400).json({ success: false, message: `${rsvp.userName} is on the waitlist, not confirmed` });
    const already = !!rsvp.checkedInAt;
    if (!already) {
      rsvp.checkedInAt = new Date();
      await rsvp.save();
    }
    res.json({ success: true, already, attendee: { _id: rsvp._id, userName: rsvp.userName, checkedInAt: rsvp.checkedInAt } });
  } catch (error) {
    console.error("checkInRsvp error:", error);
    res.status(500).json({ success: false, message: "Failed to check in" });
  }
};
