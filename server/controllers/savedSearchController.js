// Saved searches: a student's browse filters, with an alert when new
// scholarships or jobs match them (the daily job in services/scheduler.js).
import { SAVED_FILTER_FIELDS } from "../services/listingFilters.js";

const MAX_SAVED_SEARCHES = 10;
const TYPE_FEATURE = { scholarship: "scholarships", job: "jobs" };
const TYPE_LABEL = { scholarship: "Scholarships", job: "Jobs" };

const cleanFilters = (listingType, raw) => {
  const out = {};
  for (const key of SAVED_FILTER_FIELDS[listingType]) {
    const input = raw?.[key];
    const value = typeof input === "boolean" ? input : String(input ?? "").trim().slice(0, 100);
    if (value === "" || value === false) continue;
    out[key] = value;
  }
  return out;
};

const describe = (listingType, filters) => {
  const parts = [];
  if (filters.search) parts.push(`"${filters.search}"`);
  for (const [key, value] of Object.entries(filters)) {
    if (key === "search") continue;
    if (key === "isFreshGradFriendly") parts.push("fresh-grad friendly");
    else if (key === "scope") parts.push(value === "internal" ? "university awards" : "study abroad");
    else parts.push(String(value).replace(/_/g, " "));
  }
  return `${TYPE_LABEL[listingType]}: ${parts.join(", ") || "anything new"}`;
};

export const listSavedSearches = async (req, res) => {
  try {
    const searches = await req.models.SavedSearch.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, searches });
  } catch (error) {
    console.error("listSavedSearches error:", error);
    res.status(500).json({ success: false, message: "Failed to load your alerts" });
  }
};

export const createSavedSearch = async (req, res) => {
  const { listingType } = req.body || {};
  if (!SAVED_FILTER_FIELDS[listingType]) {
    return res.status(400).json({ success: false, message: "listingType must be scholarship or job" });
  }
  if (req.tenant?.enabledFeatures?.[TYPE_FEATURE[listingType]] === false) {
    return res.status(403).json({ success: false, message: "That module isn't available at your university" });
  }
  const filters = cleanFilters(listingType, req.body.filters);
  if (!Object.keys(filters).length) {
    return res.status(400).json({ success: false, message: "Search for something or pick a filter first" });
  }
  try {
    const count = await req.models.SavedSearch.countDocuments({ userId: req.user._id });
    if (count >= MAX_SAVED_SEARCHES) {
      return res.status(400).json({ success: false, message: `You can keep up to ${MAX_SAVED_SEARCHES} alerts — remove one first` });
    }
    const existing = await req.models.SavedSearch.findOne({ userId: req.user._id, listingType, filters });
    if (existing) return res.json({ success: true, search: existing, already: true });
    const search = await req.models.SavedSearch.create({
      userId: req.user._id,
      listingType,
      filters,
      label: describe(listingType, filters),
    });
    res.status(201).json({ success: true, search });
  } catch (error) {
    console.error("createSavedSearch error:", error);
    res.status(500).json({ success: false, message: "Failed to save the alert" });
  }
};

export const deleteSavedSearch = async (req, res) => {
  try {
    const result = await req.models.SavedSearch.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ success: false, message: "Alert not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("deleteSavedSearch error:", error);
    res.status(500).json({ success: false, message: "Failed to remove the alert" });
  }
};
