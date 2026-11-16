import type { Snapshot } from "../content/snapshot";
import type { Enrollment } from "../domain";
import type { LocalizedText } from "../localized-text";

export interface EnrollmentRecord {
  id: string;
  spaceId: string;
  routeId: string;
  userId: string;
  pinnedVersion: number;
  status: Enrollment["status"];
}

/** An enrollment with what reading it takes, read in one query (Platform STEP 15). */
export interface EnrollmentReading {
  enrollment: EnrollmentRecord;
  snapshot: Snapshot;
  space: { name: LocalizedText; brandColor: string | null };
}
