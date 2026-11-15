import type { LocalizedText } from "../localized-text";

/** What an edit may change about a draft; a field left out stays as it is. */
export interface RouteDetails {
  title?: LocalizedText | undefined;
  description?: LocalizedText | null | undefined;
  topic?: string | undefined;
  level?: string | undefined;
  /** Already checked by checkBrandColor; null takes the space's brand colour. */
  accentColor?: string | null | undefined;
}
