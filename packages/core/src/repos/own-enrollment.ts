import type { LocalizedText } from "../localized-text";

/** "Mis rutas": a student's own enrollment, with where they are on it. */
export interface OwnEnrollment {
  enrollmentId: string;
  routeId: string;
  title: LocalizedText;
  sourceLocale: string;
  creator: LocalizedText;
  lessonsPerModule: number[];
  /** Lessons this student has completed, for the line on their card. */
  completedLessons: number;
  /** The topic they carry on with, from 1. */
  place: { number: number; title: LocalizedText | null; finished: boolean };
}
