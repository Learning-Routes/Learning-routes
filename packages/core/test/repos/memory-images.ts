import type { ImageGenerations, ImageUsage } from "../../src/repos/image-ports";

// Route images in memory: what the Postgres repository keeps, for core's tests.

export interface ImageRow {
  id: string;
  spaceId: string;
  userId: string;
  at: number;
  usage: ImageUsage | null;
}

export const imagesState = () => new Map<string, ImageRow>();

export function memoryImages(rows: Map<string, ImageRow>, newId: () => string): ImageGenerations {
  return {
    async take(spaceId, userId, since, perMonth, at) {
      const month = [...rows.values()].filter((row) => row.userId === userId && row.at >= since);
      if (month.length >= perMonth) {
        return null;
      }
      const id = newId();
      rows.set(id, { id, spaceId, userId, at, usage: null });
      return id;
    },
    async settle(id, usage) {
      const row = rows.get(id);
      if (row) {
        row.usage = usage;
      }
    },
    async release(id) {
      if (rows.get(id)?.usage === null) {
        rows.delete(id);
      }
    },
  };
}
