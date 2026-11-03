import { SIGN_IN_TEXT } from "@learning-routes/core/copy/sign-in";
import { BRAND, negotiateLocale } from "@learning-routes/core/locales";
import { redirect } from "react-router";
import { NOTICES, type NoticeName, SignInFlow } from "../sign-in/flow";
import "../sign-in/sign-in.css";
import type { Route } from "./+types/sign-in";

const isNotice = (value: string | null): value is NoticeName =>
  (NOTICES as readonly (string | null)[]).includes(value);

export function loader({ request }: Route.LoaderArgs) {
  const notice = new URL(request.url).searchParams.get("notice");
  return {
    locale: negotiateLocale(request.headers.get("accept-language"), "es"),
    notice: isNotice(notice) ? notice : null,
  };
}

// Reached only by a submit before the page has hydrated, or with no script. The field
// has no name, so nothing of the address came with it.
export function action() {
  return redirect("/sign-in", 303);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData ? SIGN_IN_TEXT[loaderData.locale].title : "";
  return [{ title: `${title} · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  return <SignInFlow {...loaderData} />;
}
