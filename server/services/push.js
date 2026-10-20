// Browser notifications (web push). Every in-app notification made through
// notify() is also pushed to the devices the person turned notifications on
// for. Off unless VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set.
import webpush from "web-push";

let configuredWith = null;

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

const ready = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (configuredWith !== publicKey) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@atriumdesk.app", publicKey, privateKey);
    configuredWith = publicKey;
  }
  return true;
};

// The server POSTs to whatever endpoint a browser hands over, so only the
// real push services are accepted — otherwise a made-up "subscription"
// could point the server at an internal address.
// Chrome hands out fcm.googleapis.com endpoints, Chromium builds also
// *.google.com ones (e.g. jmt17.google.com).
const PUSH_SERVICE_HOSTS = [
  "googleapis.com",
  "google.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

export const isPushServiceEndpoint = (endpoint) => {
  let url;
  try {
    url = new URL(String(endpoint));
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
};

/**
 * Pushes `{title, body, url}` to every device `userId` turned notifications
 * on for. `connection` is the tenant connection the user lives in. Gone
 * subscriptions (404/410 from the push service) are removed. Returns the
 * number of devices reached.
 */
export const sendPush = async (connection, userId, { title, body, url }) => {
  if (!ready()) return 0;
  const PushSubscription = connection?.models?.PushSubscription;
  if (!PushSubscription || !userId) return 0;
  const subscriptions = await PushSubscription.find({ userId });
  const payload = JSON.stringify({ title, body: String(body || "").slice(0, 300), url: url || "/" });
  let reached = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 24 * 60 * 60, timeout: 10000 });
        reached += 1;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          console.error("sendPush failed:", error.statusCode || "", error.message);
        }
      }
    })
  );
  return reached;
};
