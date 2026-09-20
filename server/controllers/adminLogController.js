import { escapeRegex } from "../services/escapeRegex.js";

const parsePaging = (req) => ({
  limit: Math.min(parseInt(req.query.limit) || 50, 200),
  offset: Math.max(parseInt(req.query.offset) || 0, 0),
});

export const listAuditLogs = async (req, res) => {
  try {
    const { limit, offset } = parsePaging(req);
    const { actor, action, dateFrom, dateTo } = req.query;
    const filter = {};
    if (actor) filter.actor = actor;
    if (action) filter.action = { $regex: escapeRegex(action), $options: "i" };
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    const [items, total] = await Promise.all([
      req.models.AuditLog.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
      req.models.AuditLog.countDocuments(filter),
    ]);
    res.json({ success: true, items, total });
  } catch (error) {
    console.error("listAuditLogs error:", error);
    res.status(500).json({ success: false, message: "Failed to load audit logs" });
  }
};

export const listLoginEvents = async (req, res) => {
  try {
    const { limit, offset } = parsePaging(req);
    const { email, success, dateFrom, dateTo } = req.query;
    const filter = {};
    if (email) filter.email = { $regex: escapeRegex(email), $options: "i" };
    if (success !== undefined && success !== "") filter.success = success === "true";
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    const [items, total] = await Promise.all([
      req.models.LoginEvent.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
      req.models.LoginEvent.countDocuments(filter),
    ]);
    res.json({ success: true, items, total });
  } catch (error) {
    console.error("listLoginEvents error:", error);
    res.status(500).json({ success: false, message: "Failed to load login events" });
  }
};

export const listChatLogs = async (req, res) => {
  try {
    const { limit, offset } = parsePaging(req);
    const { studentId, flaggedOnly, search } = req.query;
    const matchUser = {};
    if (flaggedOnly === "true") matchUser["flags.0"] = { $exists: true };
    if (search) {
      matchUser.$or = [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { email: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    let userFilter = matchUser;
    if (studentId) userFilter = { _id: studentId };

    // No user constraints → all chats, without the user pre-query (whose
    // 500-user cap would silently drop chats on large tenants). With
    // constraints, zero matching users must mean zero chats — not the old
    // {} fallback that returned the entire tenant chat log.
    let filter = {};
    if (Object.keys(userFilter).length > 0) {
      const matchingUsers = await req.models.User.find(userFilter).select("_id").limit(500);
      const userIds = matchingUsers.map((u) => u._id);
      if (userIds.length === 0) {
        return res.json({ success: true, items: [], total: 0 });
      }
      filter = { userId: { $in: userIds } };
    }
    const [chats, total] = await Promise.all([
      req.models.Chat.find(filter)
        .sort({ updatedAt: -1 })
        .skip(offset)
        .limit(limit)
        .select("userId userName name messages updatedAt createdAt"),
      req.models.Chat.countDocuments(filter),
    ]);

    const items = chats.map((c) => ({
      _id: c._id,
      userId: c.userId,
      userName: c.userName,
      name: c.name,
      messageCount: c.messages?.length || 0,
      lastMessage: c.messages?.[c.messages.length - 1]?.content?.slice(0, 200) || "",
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
    }));

    res.json({ success: true, items, total });
  } catch (error) {
    console.error("listChatLogs error:", error);
    res.status(500).json({ success: false, message: "Failed to load chats" });
  }
};

export const getChatLog = async (req, res) => {
  try {
    const chat = await req.models.Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });
    const user = await req.models.User.findById(chat.userId).select("name email flags");
    res.json({ success: true, chat, user });
  } catch (error) {
    console.error("getChatLog error:", error);
    res.status(500).json({ success: false, message: "Failed to load chat" });
  }
};
