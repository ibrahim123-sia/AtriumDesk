// controllers/guestController.js
import crypto from "crypto";
import fetch from "node-fetch";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getModelsForTenant } from "../models/registry.js";
import { resolveTenantBySlug, DEFAULT_TENANT_SLUG } from "../services/tenantRegistry.js";
import { escapeRegex } from "../services/escapeRegex.js";

// Python FastAPI backend URL — RAG lives here
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

// Guests carry no JWT, so the suspension check protect() applies to
// authenticated routes must be re-applied here for the guest-supplied slug —
// a suspended tenant must not keep serving unauthenticated traffic. Returns
// the active tenant doc, or null (caller responds 404/403).
async function resolveActiveGuestTenant(tenantSlug) {
  const tenant = await resolveTenantBySlug(tenantSlug || DEFAULT_TENANT_SLUG);
  if (!tenant || tenant.status !== "active") return null;
  return tenant;
}

// In-memory storage for guest sessions
const guestSessions = new Map();
const GUEST_SESSION_EXPIRY = 60 * 60 * 1000; // 1 hour

const HISTORY_TURN_LIMIT = 6;

// Rev5 §19.6 — "Guest chat included in the health-check page so quota
// exhaustion is visible before it becomes a support problem." Simple
// in-memory counters (reset on restart, which is fine — this is a live
// pre-demo signal, not an audit log) surfaced via getGuestChatMetrics()
// for adminHealthController.js.
let rateLimitedCount = 0;
let sessionCapReachedCount = 0;

export function getGuestChatMetrics() {
  return {
    activeSessions: guestSessions.size,
    rateLimitedCount,
    sessionCapReachedCount,
  };
}

// Keys by IP + tenant slug, not IP alone — a shared campus NAT serving two
// tenants' guest chatbots would otherwise let one university's guest
// traffic exhaust the shared IP's quota and lock out the other university's
// guests, same reasoning as userController.js's tenantAwareKey.
const guestTenantAwareKey = (req) => {
  const tenant = req.body?.tenant || req.query?.tenant || DEFAULT_TENANT_SLUG;
  return `${ipKeyGenerator(req.ip || "")}:${tenant}`;
};

// Guest chat had zero rate limiting (flagged as the project's largest
// free-tier exposure — an unauthenticated endpoint that fans out to a paid
// LLM). IP-based since guests carry no other stable identity.
export const guestChatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: guestTenantAwareKey,
  handler: (req, res, next, options) => {
    rateLimitedCount += 1;
    res.status(options.statusCode).json(options.message);
  },
  message: { success: false, message: "Too many messages sent. Please wait a few minutes and try again, or sign up for an account." },
});

// Rev5 §19.6 — "A per-session message cap, with a prompt to register on
// reaching it." Separate from the IP-based limiter above: that resets
// every 5 minutes and only tracks IP, so a single long session spread out
// over hours (or rotating IPs) would never trip it. This caps the whole
// conversation regardless of pacing or IP.
const GUEST_SESSION_MESSAGE_CAP = 30;

export const guestSessionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: guestTenantAwareKey,
  message: { success: false, message: "Too many requests. Please wait a few minutes and try again." },
});

// Rev5 §19.6 — "RAG answer caching is more valuable here than anywhere
// else. Guest questions repeat heavily... A cache in front of the guest
// endpoint absorbs most of that traffic." Only cacheable when there's no
// prior conversation turn (a follow-up's answer depends on context, a cache
// keyed on question text alone would serve the wrong thing) and only for
// confident answers (a low-confidence miss should keep being logged/
// retried, not silently frozen as the cached response forever).
const GUEST_ANSWER_CACHE_TTL_MS = 10 * 60 * 1000;
const guestAnswerCache = new Map(); // `${tenantSlug}:${normalizedQuestion}` -> { answer, confidenceTier, expiresAt }

const normalizeQuestion = (q) => q.trim().toLowerCase().replace(/\s+/g, " ");

function getCachedGuestAnswer(tenantSlug, question) {
  const key = `${tenantSlug || DEFAULT_TENANT_SLUG}:${normalizeQuestion(question)}`;
  const entry = guestAnswerCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    guestAnswerCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedGuestAnswer(tenantSlug, question, answer, confidenceTier) {
  const key = `${tenantSlug || DEFAULT_TENANT_SLUG}:${normalizeQuestion(question)}`;
  guestAnswerCache.set(key, { answer, confidenceTier, expiresAt: Date.now() + GUEST_ANSWER_CACHE_TTL_MS });
}

// Build the trimmed history payload from guest messages. Only role/content is sent.
function buildHistoryPayload(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const recent = messages.slice(-HISTORY_TURN_LIMIT);
  return recent
    .filter((m) => m && m.role && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));
}

// Helper function to call Python backend
async function getPythonBackendResponse(question, context = {}) {
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET || "",
      },
      body: JSON.stringify({
        question,
        user_id: context.sessionId ? String(context.sessionId) : undefined,
        chat_id: context.sessionId ? String(context.sessionId) : undefined,
        tenant_slug: context.tenantSlug || DEFAULT_TENANT_SLUG,
        history: Array.isArray(context.history) ? context.history : undefined,
        // Rev 5 §8.7 USER_TYPE — guests have no portal account (narrower
        // scope, no ticket-filing instructions per Branch D/E).
        user_type: "guest",
        // Without these, rag.py falls back to its DEFAULT_UNIVERSITY_NAME
        // (MAJU) for every tenant — a guest on any OTHER tenant's chatbot
        // would be told it's "Muhammad Ali Jinnah University's assistant"
        // while still (correctly) searching that tenant's own ChromaDB
        // collection, which reads as the bot confusing itself.
        university_name: context.branding?.universityName || undefined,
        university_short: context.branding?.universityShort || undefined,
      }),
      timeout: 30000, // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Python backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return {
      answer: data.answer || "No response from Python backend",
      confidenceTier: data.confidence_tier || null,
      usage: data.usage || null,
    };
  } catch (error) {
    console.error("❌ Error calling Python backend:", error.message);
    throw new Error(`Failed to get response from Python backend: ${error.message}`);
  }
}

// Super Admin Usage tab — mirrors messageController.js's logAiUsage. Guests
// carry no req.models (no tenant middleware runs for unauthenticated
// routes), so this re-resolves the tenant connection here, same pattern as
// logIfFailedQuestion below.
async function logAiUsage(tenantSlug, usage, endpoint) {
  if (!usage) return;
  try {
    const tenant = await resolveTenantBySlug(tenantSlug || DEFAULT_TENANT_SLUG);
    if (!tenant) return;
    const models = getModelsForTenant(tenant);
    await models.AiUsageLog.create({
      userType: "guest", userId: null, endpoint,
      provider: usage.provider || "", model: usage.model || "",
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
    });
  } catch (error) {
    console.error("Failed to log guest AI usage:", error.message);
  }
}

// Rev 5 §4.3 — failed-question log applies to guests too, not just
// authenticated students. Guests have no `req.models` (no tenant middleware
// runs for unauthenticated routes), so resolve the tenant connection here,
// the same way internalController.js's flagUser does for its own
// no-JWT internal call.
async function logIfFailedQuestion(tenantSlug, { question, confidenceTier }) {
  if (confidenceTier !== "low") return;
  try {
    const tenant = await resolveTenantBySlug(tenantSlug || DEFAULT_TENANT_SLUG);
    if (!tenant) return;
    const models = getModelsForTenant(tenant);
    await models.FailedQuestion.create({ question, userType: "guest", userId: null });
  } catch (error) {
    console.error("Failed to log guest failed-question:", error.message);
  }
}

const CHIP_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "what", "when", "where", "who",
  "how", "why", "which", "does", "do", "did", "for", "to", "of", "in", "on",
  "at", "and", "or", "i", "you", "my", "your", "me", "tell", "please", "can",
]);

function extractKeywords(question) {
  return (question.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((w) => w.length >= 3 && !CHIP_STOPWORDS.has(w));
}


// Rev5 §19.3 — "context-aware follow-ups on chatbot answers... driven by
// the same data already in the system." Not a second LLM call — cheap
// keyword matches against the guest-visible (internal-scope) listings,
// same restriction as getGuestListings.
async function buildFollowUpChips(tenantSlug, question) {
  try {
    const tenant = await resolveTenantBySlug(tenantSlug || DEFAULT_TENANT_SLUG);
    if (!tenant) return [];
    const models = getModelsForTenant(tenant);
    const keywords = extractKeywords(question);
    const chips = [];

    if (keywords.length > 0) {
      const regex = new RegExp(keywords.map(escapeRegex).join("|"), "i");
      const scholarship = await models.Listing.findOne({
        listingType: "scholarship",
        status: "approved",
        scope: "internal",
        $or: [{ title: regex }, { description: regex }],
      }).sort({ deadline: 1 });
      if (scholarship) chips.push(`Scholarships available for ${scholarship.title}`);
    }

    const event = await models.Listing.findOne({
      listingType: "event",
      status: "approved",
      date: { $gte: new Date() },
    }).sort({ date: 1 });
    if (event) {
      chips.push(`Upcoming: ${event.title} · ${new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    }

    chips.push("Ask about admission requirements");
    return chips.slice(0, 3);
  } catch (error) {
    console.error("buildFollowUpChips error:", error.message);
    return [];
  }
}

// Get or create guest session
const getOrCreateGuestSession = (sessionId) => {
  if (!guestSessions.has(sessionId)) {
    guestSessions.set(sessionId, {
      id: sessionId,
      messages: [],
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
  }
  
  const session = guestSessions.get(sessionId);
  session.lastActivity = Date.now();
  
  // Cleanup old sessions periodically
  cleanupOldSessions();
  
  return session;
};

// Cleanup expired sessions
const cleanupOldSessions = () => {
  const now = Date.now();
  for (const [sessionId, session] of guestSessions.entries()) {
    if (now - session.lastActivity > GUEST_SESSION_EXPIRY) {
      guestSessions.delete(sessionId);
    }
  }
};

// Guest text chat controller — uses Python backend
export const guestTextChatController = async (req, res) => {
  try {
    // Math.random() is not cryptographically secure and this ID embeds a
    // coarse timestamp, so a predictable ID could be brute-forced to pull
    // another guest's history via GET /api/guest/history?sessionId=... —
    // crypto.randomBytes gives 128 bits of unguessable entropy instead.
    const { message, tenant, sessionId = `guest_${crypto.randomBytes(16).toString("hex")}` } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message is required and must be a non-empty string.",
      });
    }

    // Suspended tenants and disabled chatbot modules are enforced here the
    // same way requireFeature("chatbot")+protect do for student chat.
    const guestTenant = await resolveActiveGuestTenant(tenant);
    if (!guestTenant) {
      return res.status(404).json({
        success: false,
        message: "This university is not available on the platform right now.",
      });
    }
    if (guestTenant.enabledFeatures?.chatbot === false) {
      return res.status(403).json({
        success: false,
        message: "The chatbot is not enabled for this university.",
      });
    }

    // Get or create guest session
    const session = getOrCreateGuestSession(sessionId);

    const userMessageCount = session.messages.filter((m) => m.role === "user").length;
    if (userMessageCount >= GUEST_SESSION_MESSAGE_CAP) {
      sessionCapReachedCount += 1;
      return res.status(403).json({
        success: false,
        message: "You've reached the limit for a guest conversation. Register for a free account to keep chatting with no limit.",
        sessionCapReached: true,
      });
    }

    // Snapshot prior history BEFORE pushing the new user message — the
    // history we send to Python must not contain the question we're about
    // to ask (it would be a duplicate of `message`).
    const history = buildHistoryPayload(session.messages);
    
    // Add user message to session
    session.messages.push({
      type: "text",
      role: "user",
      content: message.trim(),
      timestamp: Date.now(),
    });

    // Get response from Python backend — cache hit only for a question with
    // no prior turn in this session (a follow-up's answer is context-
    // dependent, so it's never served from the flat question-text cache).
    let botReply, confidenceTier;
    const cached = history.length === 0 ? getCachedGuestAnswer(tenant, message) : null;
    if (cached) {
      botReply = cached.answer;
      confidenceTier = cached.confidenceTier;
    } else {
      try {
        const result = await getPythonBackendResponse(message, { sessionId, history, tenantSlug: tenant, branding: guestTenant.branding });
        botReply = result.answer;
        confidenceTier = result.confidenceTier;
        logAiUsage(tenant, result.usage, "guest_chat");
        if (history.length === 0 && confidenceTier !== "low") {
          setCachedGuestAnswer(tenant, message, botReply, confidenceTier);
        }
      } catch (error) {
        console.error("Failed to get response from Python backend:", error.message);
        botReply = "Sorry, I'm unable to connect to the university knowledge base at the moment. Please try again later.";
      }
    }
    logIfFailedQuestion(tenant, { question: message, confidenceTier });
    const followUpChips = await buildFollowUpChips(tenant, message);

    // Add bot response to session
    session.messages.push({
      type: "text",
      role: "assistant",
      content: botReply,
      timestamp: Date.now(),
    });

    // Save session
    guestSessions.set(sessionId, session);

    // Send response
    res.json({
      success: true,
      reply: {
        type: "text",
        role: "assistant",
        content: botReply,
        timestamp: Date.now(),
      },
      followUpChips,
      sessionId: sessionId,
      totalMessages: session.messages.length / 2, // Counts both user and bot messages
      // guestSlice reads this for the register-prompt countdown before the
      // session cap 403 hits.
      messagesRemaining: Math.max(0, GUEST_SESSION_MESSAGE_CAP - userMessageCount - 1),
      note: "Sign up for voice chat, email drafting, and saved chat history.",
      source: "python_backend"
    });

  } catch (error) {
    console.error("Guest chat error:", error.message);
    
    res.status(500).json({
      success: false,
      message: "Sorry, there was an error processing your request. Please try again.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get guest chat history
export const getGuestChatHistory = async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required.",
      });
    }

    const session = guestSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found or expired.",
      });
    }

    res.json({
      success: true,
      sessionId: sessionId,
      messages: session.messages,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      messageCount: session.messages.length,
      sessionAge: Date.now() - session.createdAt,
      willExpireIn: GUEST_SESSION_EXPIRY - (Date.now() - session.lastActivity)
    });

  } catch (error) {
    console.error("Get guest history error:", error.message);
    res.status(500).json({
      success: false,
      message: "Error retrieving chat history.",
    });
  }
};

// Rev5 §19.5 — "hold guest chats against a session identifier. On
// registration from the same session, associate that history with the new
// account." userController.js's verifyOtp reads the guest's pre-signup
// messages with this, persists them, and only then calls
// deleteGuestSession — so a failed Chat.create can't lose the transcript.
export function peekGuestSessionMessages(sessionId) {
  if (!sessionId) return [];
  const session = guestSessions.get(sessionId);
  if (!session) return [];
  return session.messages;
}

// Deletes the in-memory session once migration succeeded, so the same
// history can't be migrated twice.
export function deleteGuestSession(sessionId) {
  if (sessionId) guestSessions.delete(sessionId);
}

// Clear guest session
export const clearGuestSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required.",
      });
    }

    if (guestSessions.has(sessionId)) {
      guestSessions.delete(sessionId);
    }

    res.json({
      success: true,
      message: "Session cleared successfully.",
    });

  } catch (error) {
    console.error("Clear session error:", error.message);
    res.status(500).json({
      success: false,
      message: "Error clearing session.",
    });
  }
};

// Public branding for the guest landing page (Rev5 §19.3). Guests carry no
// JWT and no tenant slug source of their own yet, so this resolves the same
// way every other guest endpoint does — the client-supplied `tenant` query
// param if present, else DEFAULT_TENANT_SLUG — rather than hardcoding a
// university's name/colors into GuestChat.jsx.
export const getGuestBranding = async (req, res) => {
  try {
    const tenant = await resolveActiveGuestTenant(req.query.tenant);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }
    res.json({
      success: true,
      tenantSlug: tenant.slug,
      branding: tenant.branding || null,
      enabledFeatures: tenant.enabledFeatures || null,
    });
  } catch (error) {
    console.error("getGuestBranding error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load branding" });
  }
};

export default {
  guestTextChatController,
  getGuestChatHistory,
  clearGuestSession,
  getGuestBranding,
};