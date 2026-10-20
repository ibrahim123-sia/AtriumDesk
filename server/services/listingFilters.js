// The browse filters for scholarships and jobs, shared by the list
// endpoints and saved-search alerts so an alert matches exactly what the
// student saw when they saved it.
import { escapeRegex } from "./escapeRegex.js";

const textSearch = (search) =>
  search
    ? {
        $or: [
          { title: { $regex: escapeRegex(search), $options: "i" } },
          { organization: { $regex: escapeRegex(search), $options: "i" } },
          { description: { $regex: escapeRegex(search), $options: "i" } },
        ],
      }
    : {};

export const scholarshipFilter = ({ country, fundingType, degreeLevel, scope, search } = {}) => {
  const filter = { listingType: "scholarship", status: "approved" };
  // "internal" = the university's own awards and concessions.
  if (scope === "internal" || scope === "external") filter.scope = scope;
  if (country) filter.country = country;
  if (fundingType) filter.fundingType = fundingType;
  if (degreeLevel) filter.degreeLevel = degreeLevel;
  return { ...filter, ...textSearch(search) };
};

export const jobFilter = ({ workMode, location, experienceLevel, isFreshGradFriendly, search } = {}) => {
  const filter = { listingType: "job", status: "approved" };
  if (workMode) filter.workMode = workMode;
  if (location) filter.location = { $regex: escapeRegex(location), $options: "i" };
  if (experienceLevel) filter.experienceLevel = { $regex: escapeRegex(experienceLevel), $options: "i" };
  if (isFreshGradFriendly !== undefined && isFreshGradFriendly !== "") {
    filter.isFreshGradFriendly = isFreshGradFriendly === true || isFreshGradFriendly === "true";
  }
  return { ...filter, ...textSearch(search) };
};

export const filterFor = (listingType, filters) => (listingType === "job" ? jobFilter(filters) : scholarshipFilter(filters));

// The filter fields a saved search may keep, per type.
export const SAVED_FILTER_FIELDS = {
  scholarship: ["search", "country", "fundingType", "degreeLevel", "scope"],
  job: ["search", "workMode", "location", "experienceLevel", "isFreshGradFriendly"],
};
