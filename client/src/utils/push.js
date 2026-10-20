// Browser notifications (web push) for this device. Needs the service
// worker, which only runs in the built app (main.jsx registers it in
// production; in development it would fight Vite's hot reload).
import axios from "./axios";

const auth = (token) => ({ headers: { Authorization: token } });

const toKeyBytes = (base64Url) => {
  const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const registration = async () => (pushSupported() ? navigator.serviceWorker.getRegistration() : null);

// "unsupported" | "unavailable" (no service worker / not set up on the
// server) | "denied" | "on" | "off"
export const pushState = async (token) => {
  if (!pushSupported()) return "unsupported";
  const { data } = await axios.get("/api/push/config", auth(token));
  const reg = await registration();
  if (!data.enabled || !reg) return "unavailable";
  if (Notification.permission === "denied") return "denied";
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
};

export const enablePush = async (token) => {
  const { data } = await axios.get("/api/push/config", auth(token));
  const reg = await registration();
  if (!data.enabled || !reg) throw new Error("Browser notifications aren't available here");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for this site in your browser settings");
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKeyBytes(data.publicKey) }));
  try {
    await axios.post("/api/push/subscribe", sub.toJSON(), auth(token));
  } catch (error) {
    // The server didn't take it — don't leave this browser looking "on".
    await sub.unsubscribe().catch(() => {});
    throw error;
  }
};

// Stops this device's notifications — also on logout, so the next person
// to sign in on a shared computer doesn't get them.
export const disablePush = async (token) => {
  const reg = await registration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  if (token) await axios.post("/api/push/unsubscribe", { endpoint: sub.endpoint }, auth(token)).catch(() => {});
  await sub.unsubscribe().catch(() => {});
};

export const sendTestPush = (token) => axios.post("/api/push/test", {}, auth(token));
