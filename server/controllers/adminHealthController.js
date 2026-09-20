// Rev5 §13.2 — "System health / pre-demo check. One admin screen pinging
// every external dependency — LLM providers, Mongo, ChromaDB — with
// green/red status." Mongo is pinged here (this request already holds the
// tenant's connection); ChromaDB + the active LLM provider are pinged via
// Python's internal-secret bridge, the same pattern every other Node->Python
// call in this codebase uses.
import fetch from "node-fetch";
import { getGuestChatMetrics } from "./guestChatController.js";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

export const getAdminHealth = async (req, res) => {
  let mongo = { reachable: false, error: null };
  try {
    await req.models.User.db.db.command({ ping: 1 });
    mongo = { reachable: true };
  } catch (error) {
    mongo = { reachable: false, error: error.message };
  }

  let chroma = { reachable: false, error: "Could not reach Python backend" };
  let llm = { reachable: false, error: "Could not reach Python backend" };
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/internal/health?tenant_slug=${encodeURIComponent(req.tenant.slug)}`,
      { headers: { "x-internal-secret": INTERNAL_SECRET || "" } }
    );
    const data = await response.json();
    if (response.ok) {
      chroma = data.chroma;
      llm = data.llm;
    } else {
      chroma = { reachable: false, error: data.detail || `HTTP ${response.status}` };
      llm = { reachable: false, error: data.detail || `HTTP ${response.status}` };
    }
  } catch (error) {
    chroma.error = error.message;
    llm.error = error.message;
  }

  // Rev5 §19.6 — "guest chat included in the health-check page so quota
  // exhaustion is visible before it becomes a support problem."
  const guestChat = getGuestChatMetrics();

  res.json({ success: true, health: { mongo, chroma, llm, guestChat } });
};
