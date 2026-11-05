import type { LessonBlock } from "@learning-routes/core/content/lesson-view";
import type { MdNode } from "@learning-routes/core/content/markdown";
import type { LessonText } from "@learning-routes/core/copy/lesson";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { ReactNode } from "react";

/** What every block's view is given. */
export interface ViewContext {
  block: LessonBlock;
  locale: LocaleCode;
  source: string;
  words: LessonText;
  text: (value: unknown) => string;
  /** A Markdown field, in the reader's language. */
  md: (field: keyof LessonBlock["md"]) => MdNode[] | undefined;
  /** The check block, which holds its own state in lesson-parts. */
  question: (block: LessonBlock) => ReactNode;
}
