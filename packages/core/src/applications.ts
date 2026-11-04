import * as z from "zod";
import { Locale } from "./localized-text";

// "Quiero enseñar" (Platform STEP 4 §6.3): what an application holds. It needs no account.

const WEB_LINK = /^https?:\/\//i;

const OneLine = (max: number) => z.string().trim().min(1).max(max);

export const CreatorApplication = z.strictObject({
  name: OneLine(200),
  email: z.email().max(320),
  teaches: OneLine(1000),
  // Shown to an operator as a link, so only a web address.
  link: z.url().max(500).regex(WEB_LINK).nullish(),
  locale: Locale,
});

export type CreatorApplication = z.infer<typeof CreatorApplication>;
