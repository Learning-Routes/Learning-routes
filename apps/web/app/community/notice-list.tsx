import { COMMUNITY_TEXT } from "@learning-routes/core/copy/community";
import { HUB_TEXT } from "@learning-routes/core/copy/hub";
import { SHELL_TEXT } from "@learning-routes/core/copy/shell";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { CommunityNotification } from "@learning-routes/core/repos/community-ports";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import { filled, inLocale } from "../storefront/words";
import { ago } from "./post";

// A person's notices (Platform STEP 23): what happened to what they wrote, and where. Each one
// opens the conversation it is about, in its route's community.

export function NoticeList({
  notices,
  enrollments,
  locale,
  now,
}: {
  notices: CommunityNotification[];
  enrollments: OwnEnrollment[];
  locale: LocaleCode;
  now: number;
}) {
  const words = { ...SHELL_TEXT[locale], ...HUB_TEXT[locale] };
  const said = { reply: words.noticeReply, answer: words.noticeAnswer, pinned: words.noticePinned };
  if (notices.length === 0) {
    return <p className="hub-quiet">{words.noNotices}</p>;
  }
  return (
    <ul className="notice-list">
      {notices.map((notice) => {
        const enrollment = enrollments.find((one) => one.routeId === notice.routeId);
        const route = enrollment
          ? filled(words.inRoute, {
              route: inLocale(enrollment.title, locale, enrollment.sourceLocale),
            })
          : "";
        const line = (
          <>
            <b>{said[notice.kind]}</b>
            <span>
              {`${route ? `${route}, ` : ""}${ago(notice.createdAt, now, locale, COMMUNITY_TEXT[locale].now)}`}
            </span>
          </>
        );
        return (
          <li key={notice.id} className={notice.readAt === null ? "notice is-new" : "notice"}>
            {enrollment ? (
              <a href={`/comunidad/${enrollment.enrollmentId}#p-${notice.postId}`}>{line}</a>
            ) : (
              <p>{line}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
