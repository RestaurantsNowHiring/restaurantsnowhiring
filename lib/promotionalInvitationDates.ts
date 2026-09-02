const ADMIN_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** Preserve the YYYY-MM-DD calendar date selected by an Admin. */
export function formatPromotionalOfferDate(value: string | null) {
  return value ? ADMIN_DATE_FORMAT.format(new Date(value)) : "—";
}
