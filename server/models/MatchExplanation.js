import mongoose from "mongoose";

/**
 * Rev 5 §8 Layer 3 — LLM-generated personalized match explanations, cached
 * so the same (student-profile-relevant-fields, listing-content) pair never
 * re-calls the LLM. `cacheKey` is a hash of those two things (computed in
 * server/services/matchExplanations.js) rather than a userId+listingId pair,
 * so two students with identical relevant profile fields share one cached
 * explanation for the same listing.
 */
export const matchExplanationSchema = new mongoose.Schema(
  {
    cacheKey: { type: String, required: true, unique: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    matchState: { type: String, required: true },
    explanation: { type: String, required: true },
  },
  { timestamps: true }
);
