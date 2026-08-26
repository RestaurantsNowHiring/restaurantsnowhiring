export const SCHEDULE_OPTIONS = [
  "Day shift",
  "Night shift",
  "Morning shift",
  "Evening shift",
  "Overnight shift",
  "Weekends required",
  "Weekdays only (M-F)",
  "Flexible schedule",
  "Rotating schedule",
  "On-call",
  "Overtime",
  "No weekends",
  "Choose your own hours",
  "Other",
];

export const BENEFIT_OPTIONS = [
  "Health insurance",
  "Dental insurance",
  "Vision insurance",
  "401(k)",
  "Paid time off",
  "Flexible schedule",
  "Employee discount",
  "Free meals",
  "Tuition assistance",
  "Paid training",
  "Referral bonus",
  "Bonus pay",
  "Overtime available",
  "Career growth",
  "Other",
];

export const ROLE_OPTIONS = [
  "Line",
  "Prep",
  "Dish",
  "Server",
  "Cashier",
  "Host",
  "Bartender",
  "Manager",
  "Other",
];

export const EMPLOYMENT_OPTIONS = ["Full time", "Part time", "Seasonal", "Temporary"];

export const STATE_OPTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

export const COUNTRY_OPTIONS = ["United States", "Canada"] as const;
export type JobCountry = (typeof COUNTRY_OPTIONS)[number];

export const CANADIAN_PROVINCE_OPTIONS = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick",
  "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia", "Nunavut",
  "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon",
];

export function normalizeJobCountry(value: unknown): JobCountry | null {
  if (value === undefined || value === null || value === "" || value === "United States" || value === "US") {
    return "United States";
  }
  if (value === "Canada" || value === "CA") return "Canada";
  return null;
}

export function formatJobLocation(job: { city?: string | null; state?: string | null; country?: string | null }) {
  const country = normalizeJobCountry(job.country) ?? "United States";
  const locality = [job.city, job.state].filter(Boolean).join(", ");
  return country === "Canada" ? [locality, "Canada"].filter(Boolean).join(", ") : locality;
}
