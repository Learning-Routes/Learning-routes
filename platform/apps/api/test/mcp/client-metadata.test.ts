import { describe, expect, it } from "vitest";
import { boundedMetadataFetch } from "../../src/mcp/client-metadata";

describe("fetching a client's metadata document", () => {
  it("refuses anything but https", async () => {
    let asked = false;
    const fetcher = boundedMetadataFetch(async () => {
      asked = true;
      return new Response("{}");
    });
    await expect(fetcher("http://client.example.test/metadata.json")).rejects.toThrow("https");
    expect(asked).toBe(false);
  });

  it("follows no redirect", async () => {
    let init: RequestInit | undefined;
    const fetcher = boundedMetadataFetch(async (_url, given) => {
      init = given;
      return new Response("{}");
    });
    await fetcher("https://client.example.test/metadata.json");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("stops reading a body that is too large", async () => {
    const fetcher = boundedMetadataFetch(async () => new Response("x".repeat(10_001)));
    await expect(fetcher("https://client.example.test/metadata.json")).rejects.toThrow("too large");
  });

  it("hands back a document within bounds", async () => {
    const fetcher = boundedMetadataFetch(async () => new Response('{"client_name":"x"}'));
    const answer = await fetcher("https://client.example.test/metadata.json");
    expect(await answer.json()).toEqual({ client_name: "x" });
  });
});
