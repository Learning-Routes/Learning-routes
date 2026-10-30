import { BLOCK_TYPES } from "@learning-routes/core/blocks/types";
import { Route } from "@learning-routes/core/domain";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, createdAt, id, oneOf, updatedAt } from "./columns";
import { spaces } from "./tenancy";

// Content (Platform STEP 2 §2.6–§2.9): the mutable draft of a route. Every row
// carries its space; each child names its parent together with that space, so a
// child's space can never disagree with its parent's. Content is archived, never
// deleted: foreign keys into routes restrict. Ids never change, so a published
// snapshot copies them verbatim.

/** A fractional position key from core's keyBetween, compared byte by byte. */
const position = customType<{ data: string }>({ dataType: () => 'text collate "C"' });

export const routes = pgTable(
  "routes",
  {
    id: id(),
    spaceId: uuid()
      .notNull()
      .references(() => spaces.id),
    slug: text().notNull(),
    title: jsonb().notNull(),
    description: jsonb(),
    sourceLocale: text().notNull(),
    access: text().notNull(),
    pricing: text().notNull(),
    // Bumped on every draft change; an edit names the revision it read (§4.3).
    draftRevision: bigint({ mode: "number" }).notNull().default(0),
    latestPublishedVersion: integer(),
    // Provenance, not a relationship: no foreign key, so a fork can outlive its source.
    forkedFromSpaceId: uuid(),
    forkedFromRouteId: uuid(),
    forkedFromVersion: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    unique("routes_space_id_slug_key").on(t.spaceId, t.slug),
    unique("routes_id_space_id_key").on(t.id, t.spaceId),
    check(
      "routes_title_localized",
      sql`app.is_localized(${t.title}) and ${t.title} ? ${t.sourceLocale}`,
    ),
    check("routes_description_localized", sql`app.is_localized(${t.description})`),
    check("routes_source_locale", sql`app.is_locale_list(array[${t.sourceLocale}])`),
    check("routes_access", sql`${t.access} in (${oneOf(Route.shape.access.options)})`),
    check("routes_pricing", sql`${t.pricing} in (${oneOf(Route.shape.pricing.options)})`),
  ],
);

export const modules = pgTable(
  "modules",
  {
    id: id(),
    spaceId: uuid().notNull(),
    routeId: uuid().notNull(),
    position: position().notNull(),
    title: jsonb().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    foreignKey({
      name: "modules_route_id_fkey",
      columns: [t.routeId, t.spaceId],
      foreignColumns: [routes.id, routes.spaceId],
    }).onDelete("restrict"),
    unique("modules_route_id_position_key").on(t.routeId, t.position),
    unique("modules_id_route_id_space_id_key").on(t.id, t.routeId, t.spaceId),
    check("modules_title_localized", sql`app.is_localized(${t.title})`),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: id(),
    spaceId: uuid().notNull(),
    routeId: uuid().notNull(),
    moduleId: uuid().notNull(),
    position: position().notNull(),
    title: jsonb().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    // A lesson's route and space are its module's.
    foreignKey({
      name: "lessons_module_id_fkey",
      columns: [t.moduleId, t.routeId, t.spaceId],
      foreignColumns: [modules.id, modules.routeId, modules.spaceId],
    }).onDelete("restrict"),
    unique("lessons_module_id_position_key").on(t.moduleId, t.position),
    unique("lessons_id_space_id_key").on(t.id, t.spaceId),
    unique("lessons_id_route_id_space_id_key").on(t.id, t.routeId, t.spaceId),
    check("lessons_title_localized", sql`app.is_localized(${t.title})`),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    id: id(),
    spaceId: uuid().notNull(),
    lessonId: uuid().notNull(),
    position: position().notNull(),
    kind: text().notNull(),
    // Validated by core's Block schema before every write.
    data: jsonb().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    foreignKey({
      name: "blocks_lesson_id_fkey",
      columns: [t.lessonId, t.spaceId],
      foreignColumns: [lessons.id, lessons.spaceId],
    }).onDelete("restrict"),
    unique("blocks_lesson_id_position_key").on(t.lessonId, t.position),
    check("blocks_kind", sql`${t.kind} in (${oneOf(BLOCK_TYPES)})`),
    check("blocks_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);

// Both lessons belong to the named route. core refuses a cycle (createsCycle)
// before the insert.
export const lessonPrerequisites = pgTable(
  "lesson_prerequisites",
  {
    spaceId: uuid().notNull(),
    routeId: uuid().notNull(),
    lessonId: uuid().notNull(),
    requiresLessonId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.lessonId, t.requiresLessonId] }),
    foreignKey({
      name: "lesson_prerequisites_route_id_fkey",
      columns: [t.routeId, t.spaceId],
      foreignColumns: [routes.id, routes.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "lesson_prerequisites_lesson_id_fkey",
      columns: [t.lessonId, t.routeId, t.spaceId],
      foreignColumns: [lessons.id, lessons.routeId, lessons.spaceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "lesson_prerequisites_requires_lesson_id_fkey",
      columns: [t.requiresLessonId, t.routeId, t.spaceId],
      foreignColumns: [lessons.id, lessons.routeId, lessons.spaceId],
    }).onDelete("restrict"),
    check("lesson_prerequisites_not_itself", sql`${t.lessonId} <> ${t.requiresLessonId}`),
  ],
);
