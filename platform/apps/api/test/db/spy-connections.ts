import pg from "pg";
import { vi } from "vitest";

/** Counts the database connections opened from here on; restore with vi.restoreAllMocks. */
export const spyOnConnections = () => vi.spyOn(pg.Client.prototype, "connect");
