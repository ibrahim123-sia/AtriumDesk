// User request — admin-managed "university activity" tabs (Sports,
// Societies, etc.) shown in the guest sidebar. CRUD here mirrors
// adminSourceController.js's shape (req.models, try/catch, JSON responses);
// the guest-facing read side lives in guestActivityController.js since
// guests have no req.models (see that file's own header).

// Fixed allow-list, not free text — a section's icon name gets passed
// straight to lucide-react's dynamic icon lookup on the client
// (GuestSidebar.jsx), so an unvalidated string could reference a
// nonexistent export and break the sidebar render for every guest.
export const ALLOWED_ICONS = [
  "Sparkles", "Trophy", "Users", "Music", "Palette", "BookOpen", "Camera",
  "Dumbbell", "Globe", "Heart", "Mic", "Code", "Drama", "Landmark", "Rocket",
];

const SECTION_TYPES = new Set(["heading", "paragraph", "image"]);

const slugify = (title) =>
  String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const validateSections = (sections) => {
  if (!Array.isArray(sections)) return "sections must be an array";
  for (const s of sections) {
    if (!s || typeof s !== "object") return "each section must be an object";
    if (!SECTION_TYPES.has(s.type)) return `invalid section type: ${s.type}`;
    if (!s.content || !String(s.content).trim()) return "each section needs non-empty content";
  }
  return null;
};

const sanitizeSections = (sections) =>
  sections.map((s) => ({
    type: s.type,
    content: String(s.content).trim(),
    caption: s.caption ? String(s.caption).trim() : "",
  }));

export const listActivityTabs = async (req, res) => {
  try {
    const tabs = await req.models.ActivityTab.find({}).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, tabs });
  } catch (error) {
    console.error("listActivityTabs error:", error);
    res.status(500).json({ success: false, message: "Failed to load activity tabs" });
  }
};

export const getActivityTab = async (req, res) => {
  try {
    const tab = await req.models.ActivityTab.findById(req.params.id);
    if (!tab) return res.status(404).json({ success: false, message: "Activity tab not found" });
    res.json({ success: true, tab });
  } catch (error) {
    console.error("getActivityTab error:", error);
    res.status(500).json({ success: false, message: "Failed to load activity tab" });
  }
};

export const createActivityTab = async (req, res) => {
  const { title, icon, order, isPublished, sections } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, message: "title is required" });
  }
  if (icon && !ALLOWED_ICONS.includes(icon)) {
    return res.status(400).json({ success: false, message: `icon must be one of: ${ALLOWED_ICONS.join(", ")}` });
  }
  const sectionError = sections !== undefined ? validateSections(sections) : null;
  if (sectionError) return res.status(400).json({ success: false, message: sectionError });

  try {
    const baseSlug = slugify(title);
    if (!baseSlug) return res.status(400).json({ success: false, message: "title must contain at least one letter or number" });

    // Two tabs titled the same on one tenant get -2/-3/... appended, same
    // "make it unique, don't reject" approach the platform already uses for
    // tenant slugs (server/controllers/platformController.js).
    let slug = baseSlug;
    let suffix = 2;
    while (await req.models.ActivityTab.findOne({ slug })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const tab = await req.models.ActivityTab.create({
      title: String(title).trim(),
      slug,
      icon: icon || "Sparkles",
      order: Number.isFinite(Number(order)) ? Number(order) : 0,
      isPublished: !!isPublished,
      sections: sections ? sanitizeSections(sections) : [],
    });
    res.status(201).json({ success: true, tab });
  } catch (error) {
    console.error("createActivityTab error:", error);
    res.status(500).json({ success: false, message: "Failed to create activity tab" });
  }
};

export const updateActivityTab = async (req, res) => {
  const { title, icon, order, isPublished, sections } = req.body || {};
  if (icon && !ALLOWED_ICONS.includes(icon)) {
    return res.status(400).json({ success: false, message: `icon must be one of: ${ALLOWED_ICONS.join(", ")}` });
  }
  const sectionError = sections !== undefined ? validateSections(sections) : null;
  if (sectionError) return res.status(400).json({ success: false, message: sectionError });

  try {
    const tab = await req.models.ActivityTab.findById(req.params.id);
    if (!tab) return res.status(404).json({ success: false, message: "Activity tab not found" });

    // Title changes do NOT reslug — an already-published tab's URL should
    // stay stable even if the admin fixes a typo in the display title.
    if (title !== undefined) {
      const trimmed = String(title).trim();
      if (!trimmed) return res.status(400).json({ success: false, message: "title cannot be empty" });
      tab.title = trimmed;
    }
    if (icon !== undefined) tab.icon = icon;
    if (order !== undefined) tab.order = Number.isFinite(Number(order)) ? Number(order) : tab.order;
    if (isPublished !== undefined) tab.isPublished = !!isPublished;
    if (sections !== undefined) tab.sections = sanitizeSections(sections);

    await tab.save();
    res.json({ success: true, tab });
  } catch (error) {
    console.error("updateActivityTab error:", error);
    res.status(500).json({ success: false, message: "Failed to update activity tab" });
  }
};

export const deleteActivityTab = async (req, res) => {
  try {
    const tab = await req.models.ActivityTab.findByIdAndDelete(req.params.id);
    if (!tab) return res.status(404).json({ success: false, message: "Activity tab not found" });
    res.json({ success: true, message: "Activity tab deleted" });
  } catch (error) {
    console.error("deleteActivityTab error:", error);
    res.status(500).json({ success: false, message: "Failed to delete activity tab" });
  }
};

// Returns the uploaded image's URL for the admin UI to drop into an
// "image" section's `content` field — same shape as tenant-logo/avatar
// upload responses elsewhere in the app.
export const uploadActivityImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Image file is required" });
  res.json({ success: true, url: `/uploads/activity-images/${req.file.filename}` });
};
