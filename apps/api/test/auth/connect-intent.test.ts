import { describe, expect, it } from "vitest";
import { readConnectIntent } from "../../src/auth/connect-intent";

describe("an assistant's request waiting for sign-in", () => {
  it("goes back to the authorization endpoint, and nowhere else", () => {
    const waiting = encodeURIComponent("client_id=a&sig=b");
    expect(readConnectIntent(`other=1; __Host-lr_connect=${waiting}`)).toBe(
      "/api/auth/oauth2/authorize?client_id=a&sig=b",
    );
  });

  it("is nothing without the cookie", () => {
    expect(readConnectIntent("other=1")).toBeNull();
    expect(readConnectIntent(undefined)).toBeNull();
    expect(readConnectIntent("__Host-lr_connect=")).toBeNull();
  });
});
