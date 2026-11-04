import { describe, expect, it } from "vitest";
import { video } from "../src/content/sections/media";

const body = (fields: Record<string, unknown>) => JSON.stringify(fields);

describe("a video block", () => {
  it.each([["  "], [[]], [{}]])(
    "is a concept when its video_url is blank or empty (%j), as v1's present? read it",
    (videoUrl) => {
      expect(video("Clip", body({ video_url: videoUrl })).type).toBe("concept");
    },
  );

  it("keeps a present video_url, and turns blank optional fields into null", () => {
    const block = video("Clip", body({ video_url: 5, subtitles_url: "", title: [] }));
    expect(block).toMatchObject({
      type: "video",
      video_url: 5,
      subtitles_url: null,
      title: "Clip",
    });
  });
});
