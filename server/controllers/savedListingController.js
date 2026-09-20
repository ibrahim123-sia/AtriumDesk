/**
 * Rev 5 §4.5/§10 — saved scholarships/jobs, the foundation for deadline
 * reminders and saved-item-change alerts. See server/models/SavedListing.js.
 */

// /api/saved is cross-type, so requireFeature can't gate it at the route
// level the way jobRoutes/scholarshipRoutes do — enforce per listingType
// here instead, or a tenant with the jobs module disabled would still
// serve and accept saved job listings.
const FEATURE_FOR_TYPE = { scholarship: "scholarships", job: "jobs", event: "events" };
const isTypeEnabled = (tenant, listingType) =>
  tenant?.enabledFeatures?.[FEATURE_FOR_TYPE[listingType]] !== false;

export const listSaved = async (req, res) => {
  try {
    const saved = await req.models.SavedListing.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const listingIds = saved.map((s) => s.listingId);
    const listings = await req.models.Listing.find({ _id: { $in: listingIds } });
    const byId = new Map(listings.map((l) => [l._id.toString(), l]));
    const items = saved
      .map((s) => ({ savedId: s._id, listing: byId.get(s.listingId.toString()) || null, createdAt: s.createdAt }))
      .filter((item) => item.listing && isTypeEnabled(req.tenant, item.listing.listingType));
    res.json({ success: true, saved: items });
  } catch (error) {
    console.error("listSaved error:", error);
    res.status(500).json({ success: false, message: "Failed to load saved items" });
  }
};

export const saveListing = async (req, res) => {
  const { listingId } = req.params;
  try {
    const listing = await req.models.Listing.findById(listingId);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    if (!isTypeEnabled(req.tenant, listing.listingType)) {
      return res.status(403).json({ success: false, message: "This module is not enabled for your university." });
    }
    const saved = await req.models.SavedListing.findOneAndUpdate(
      { userId: req.user._id, listingId },
      { userId: req.user._id, listingId, listingType: listing.listingType },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, saved });
  } catch (error) {
    console.error("saveListing error:", error);
    res.status(500).json({ success: false, message: "Failed to save listing" });
  }
};

export const unsaveListing = async (req, res) => {
  const { listingId } = req.params;
  try {
    await req.models.SavedListing.deleteOne({ userId: req.user._id, listingId });
    res.json({ success: true });
  } catch (error) {
    console.error("unsaveListing error:", error);
    res.status(500).json({ success: false, message: "Failed to unsave listing" });
  }
};
