import type { TutorQuestions, TutorUsage } from "../../src/repos/tutor-ports";

// The tutor's questions in memory: what the Postgres repository keeps, for core's tests.

export interface AskedRow {
  id: string;
  spaceId: string;
  userId: string;
  enrollmentId: string;
  at: number;
  usage: TutorUsage | null;
}

export const tutorState = () => new Map<string, AskedRow>();

export function memoryTutor(rows: Map<string, AskedRow>, newId: () => string): TutorQuestions {
  return {
    async take(spaceId, userId, enrollmentId, since, perDay, at) {
      const today = [...rows.values()].filter((row) => row.userId === userId && row.at >= since);
      if (today.length >= perDay) {
        return null;
      }
      const id = newId();
      rows.set(id, { id, spaceId, userId, enrollmentId, at, usage: null });
      return id;
    },
    async settle(id, usage) {
      const row = rows.get(id);
      if (row) {
        row.usage = usage;
      }
    },
    async release(id) {
      rows.delete(id);
    },
    async spentSince(userId, since) {
      return [...rows.values()]
        .filter((row) => row.userId === userId && row.at >= since)
        .reduce((sum, row) => sum + (row.usage?.microcents ?? 0), 0);
    },
  };
}
