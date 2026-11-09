import { describe, expect, it } from "vitest";
import { doorFor } from "../../src/agent/door";

const APP = "https://app.example.com";
const SPACE = "0193a0b0-0000-7000-8000-000000000001";
const UPGRADE = { upgrade: "websocket", origin: APP };

const knock = (path: string, headers: Record<string, string>) =>
  doorFor(new Request(`${APP}${path}`, { headers }), APP);

describe("the assistant's door", () => {
  it("lets a WebSocket from the app through, for a space named by its id", () => {
    expect(knock(`/creador/asistente/conexion?space=${SPACE}`, UPGRADE)).toEqual({
      spaceId: SPACE,
    });
  });

  it("answers health checks and nothing else on other paths", () => {
    expect((knock("/health", {}) as Response).status).toBe(200);
    expect((knock("/agents/studio/x", UPGRADE) as Response).status).toBe(404);
  });

  it("is shut to plain requests, to other sites, and to a space that is not an id", () => {
    const at = `/creador/asistente/conexion?space=${SPACE}`;
    expect((knock(at, { origin: APP }) as Response).status).toBe(426);
    expect(
      (knock(at, { ...UPGRADE, origin: "https://elsewhere.example" }) as Response).status,
    ).toBe(403);
    expect((knock(at, { upgrade: "websocket" }) as Response).status).toBe(403);
    expect((knock("/creador/asistente/conexion?space=../x", UPGRADE) as Response).status).toBe(404);
  });
});
