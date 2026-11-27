import { ROUTE_UPDATES_TEXT } from "@learning-routes/core/copy/route-updates";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { OwnEnrollment } from "@learning-routes/core/repos/own-enrollment";
import { Form, useNavigation } from "react-router";
import { filled, inLocale } from "../storefront/words";
import { Button } from "../ui/button";
import { Notice } from "../ui/parts";

/**
 * A creator published the route again after the student started it. The student stays on the
 * version they began until they say so: moving keeps what they completed, lesson by lesson.
 */
export function RouteUpdates({
  enrollments,
  said,
  locale,
}: {
  enrollments: OwnEnrollment[];
  /** What the last move answered, when the page comes back from one. */
  said: "updated" | "updateFailed" | undefined;
  locale: LocaleCode;
}) {
  const words = ROUTE_UPDATES_TEXT[locale];
  const isSending = useNavigation().state !== "idle";
  const waiting = enrollments.filter((enrollment) => enrollment.hasUpdate);
  return (
    <>
      {said ? <Notice tone={said === "updated" ? "success" : "error"} title={words[said]} /> : null}
      {waiting.map((enrollment) => (
        <Notice
          key={enrollment.enrollmentId}
          tone="info"
          title={filled(words.updateReady, {
            route: inLocale(enrollment.title, locale, enrollment.sourceLocale),
          })}
        >
          <Form method="post">
            <input type="hidden" name="enrollment" value={enrollment.enrollmentId} />
            <Button type="submit" size="small" disabled={isSending}>
              {words.update}
            </Button>
          </Form>
        </Notice>
      ))}
    </>
  );
}
