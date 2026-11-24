// Travel between pages (Platform STEP 9 §6). The browser decides whether an arriving page takes
// part the moment it meets <body>, from the styles it already has; a stylesheet still on its way
// does not count, and the transition was skipped (and logged as a script error) on most arrivals.
// So the opt-in travels in the page itself, and the policy allows exactly this text and no other
// inline style. The test keeps the two in step.

export const TRAVEL_STYLE =
  "@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}}";

export const TRAVEL_STYLE_HASH = "'sha256-SX7UqyxGVDSLzV90icKkPuaEGi8NcinaZfagIyBzAuY='";
