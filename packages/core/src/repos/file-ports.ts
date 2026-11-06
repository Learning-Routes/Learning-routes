import type { RepoResult } from "./repo-result";

// The files a space keeps on the content host (Platform STEP 9 §2).

export interface StoredFile {
  key: string;
  kind: "creation" | "asset";
  contentType: string;
  bytes: number;
}

/** What a space keeps on the content host, for its quota (Platform STEP 9 §2). Never changed. */
export interface StoredFiles {
  /** The bytes a space stores, every file once; uploads to the space take turns from here. */
  usage(spaceId: string): Promise<number>;
  has(spaceId: string, key: string): Promise<boolean>;
  /** Keeps a file's row; one already kept is left as it is. */
  record(spaceId: string, file: StoredFile): Promise<RepoResult<void>>;
}
