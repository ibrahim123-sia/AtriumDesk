import mongoose from "mongoose";

// User request — admin-managed "university activity" pages (Sports,
// Societies, etc.) that appear as extra tabs in the guest sidebar next to
// Chat and Scholarships. Content is an ordered list of typed blocks rather
// than a single rich-text blob so the guest-facing template (heading /
// paragraph / image, consistently styled) stays fixed across every tab —
// the admin picks WHAT to say, not how the page looks.
const activityTabSectionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["heading", "paragraph", "image"], required: true },
    // Heading/paragraph: the text itself. Image: the uploaded file's URL
    // (see POST /admin/activity-tabs/upload-image).
    content: { type: String, required: true, trim: true },
    // Image sections only — optional caption shown under the image.
    caption: { type: String, default: "", trim: true },
  },
  { _id: false }
);

export const activityTabSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "title is required"], trim: true },
    // URL-safe identifier, derived from title at creation time (see
    // adminActivityController.js's slugify) — stable even if title is
    // edited later, since guest links/bookmarks point at the slug.
    slug: { type: String, required: true, trim: true, lowercase: true },
    // lucide-react icon name shown in the sidebar — validated against a
    // fixed allow-list server-side (see ALLOWED_ICONS in the controller) so
    // an admin can never inject an arbitrary/unknown component name.
    icon: { type: String, default: "Sparkles" },
    // Sidebar ordering, lowest first. Ties break on createdAt.
    order: { type: Number, default: 0 },
    // Draft tabs are editable in the admin UI but never returned to guests.
    isPublished: { type: Boolean, default: false },
    sections: { type: [activityTabSectionSchema], default: [] },
  },
  { timestamps: true }
);

activityTabSchema.index({ slug: 1 }, { unique: true });

// No default export — see server/models/registry.js.
