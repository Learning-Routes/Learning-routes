import { SpaceRole } from "@learning-routes/core/domain";
import type { Locale, LocalizedText } from "@learning-routes/core/localized-text";
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { archivedAt, createdAt, id, oneOf, updatedAt } from "./columns";

// Tenancy (Platform STEP 2 §2.2–§2.5): who a user is beyond their account, the
// spaces, and each user's role in each space.

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text(),
    // FSRS daily limits and streaks count the learner's own day.
    timeZone: text().notNull().default("UTC"),
    uiLocale: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "user_profiles_ui_locale",
      sql`${t.uiLocale} is null or app.is_locale_list(array[${t.uiLocale}])`,
    ),
    check("user_profiles_time_zone", sql`app.is_time_zone(${t.timeZone})`),
  ],
);

export const spaces = pgTable(
  "spaces",
  {
    id: id(),
    slug: text().notNull().unique(),
    name: jsonb().$type<LocalizedText>().notNull(),
    defaultLocale: text().$type<Locale>().notNull(),
    locales: text().array().$type<Locale[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    check("spaces_name_localized", sql`app.is_localized(${t.name})`),
    check("spaces_locales", sql`app.is_locale_list(${t.locales})`),
    check("spaces_default_locale", sql`${t.defaultLocale} = any (${t.locales})`),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    spaceId: uuid()
      .notNull()
      .references(() => spaces.id),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().$type<SpaceRole>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    index("memberships_user_id_space_id_idx").on(t.userId, t.spaceId),
    check("memberships_role", sql`${t.role} in (${oneOf(SpaceRole.options)})`),
  ],
);

export const platformRoles = pgTable("platform_roles", {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  isOperator: boolean().notNull().default(false),
});
