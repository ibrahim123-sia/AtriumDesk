// Turning browser notifications on and off for a device.
import rateLimit from "express-rate-limit";
import { pushPublicKey, isPushServiceEndpoint, sendPush } from "../services/push.js";

export const pushWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant?.slug || "?"}:${req.user?._id}`,
  message: { success: false, message: "Too many requests — please wait a few minutes." },
});

const MAX_DEVICES = 10;
const KEY = /^[A-Za-z0-9_-]+={0,2}$/;

// GET /api/push/config
export const getPushConfig = (req, res) => {
  const publicKey = pushPublicKey();
  res.json({ success: true, enabled: !!publicKey, publicKey });
};

// POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }
export const subscribePush = async (req, res) => {
  if (!pushPublicKey()) return res.status(503).json({ success: false, message: "Browser notifications aren't set up on this server" });
  const { endpoint, keys } = req.body || {};
  if (!isPushServiceEndpoint(endpoint)) {
    return res.status(400).json({ success: false, message: "That isn't a browser push subscription" });
  }
  const p256dh = String(keys?.p256dh || "");
  const auth = String(keys?.auth || "");
  if (!KEY.test(p256dh) || !KEY.test(auth) || p256dh.length > 200 || auth.length > 100) {
    return res.status(400).json({ success: false, message: "The subscription keys are missing or malformed" });
  }
  try {
    // A shared computer: the device now belongs to whoever turned it on last.
    await req.models.PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId: req.user._id, keys: { p256dh, auth }, userAgent: String(req.headers["user-agent"] || "").slice(0, 200) },
      { upsert: true, setDefaultsOnInsert: true }
    );
    const devices = await req.models.PushSubscription.find({ userId: req.user._id }).sort({ updatedAt: -1 }).select("_id");
    if (devices.length > MAX_DEVICES) {
      await req.models.PushSubscription.deleteMany({ _id: { $in: devices.slice(MAX_DEVICES).map((d) => d._id) } });
    }
    res.status(201).json({ success: true });
  } catch (error) {
    console.error("subscribePush error:", error);
    res.status(500).json({ success: false, message: "Couldn't turn notifications on" });
  }
};

// POST /api/push/unsubscribe { endpoint }
export const unsubscribePush = async (req, res) => {
  try {
    await req.models.PushSubscription.deleteOne({ endpoint: String(req.body?.endpoint || ""), userId: req.user._id });
    res.json({ success: true });
  } catch (error) {
    console.error("unsubscribePush error:", error);
    res.status(500).json({ success: false, message: "Couldn't turn notifications off" });
  }
};

// POST /api/push/test — a sample notification to the person's own devices
export const sendTestPush = async (req, res) => {
  try {
    const brand = req.tenant?.branding?.universityShort || req.tenant?.branding?.universityName || "AtriumDesk";
    const reached = await sendPush(req.models.PushSubscription.db, req.user._id, {
      title: brand,
      body: "Notifications are on — this is how replies and reminders will reach you.",
      url: "/",
    });
    res.json({ success: true, reached });
  } catch (error) {
    console.error("sendTestPush error:", error);
    res.status(500).json({ success: false, message: "Couldn't send a test notification" });
  }
};
