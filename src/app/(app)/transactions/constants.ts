export const CATEGORIES = [
  "food",
  "transport",
  "shopping",
  "bills",
  "entertainment",
  "health",
  "education",
  "travel",
  "subscription",
  "salary",
  "gift",
  "refund",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
