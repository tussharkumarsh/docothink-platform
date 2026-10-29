import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildIceServers, turnCredentials } from "./ice";

describe("TURN REST credentials", () => {
  it("encodes expiry and user, signed with HMAC-SHA1", () => {
    const { username, credential } = turnCredentials("s3cret", "user-1", 600, Date.UTC(2026, 9, 29, 0, 0, 0));
    expect(username).toBe(`${Date.UTC(2026, 9, 29) / 1000 + 600}:user-1`);
    expect(credential).toBe(createHmac("sha1", "s3cret").update(username).digest("base64"));
  });

  it("builds STUN-only, static TURN, and ephemeral TURN configurations", () => {
    const base = { stunUrls: ["stun:stun.example.org:3478"], turnUrls: [], turnSecret: "", turnUsername: "", turnCredential: "" };
    expect(buildIceServers(base, "u")).toEqual([{ urls: ["stun:stun.example.org:3478"] }]);
    const staticTurn = buildIceServers({ ...base, turnUrls: ["turn:turn.example.org:3478"], turnUsername: "a", turnCredential: "b" }, "u");
    expect(staticTurn[1]).toEqual({ urls: ["turn:turn.example.org:3478"], username: "a", credential: "b" });
    const ephemeral = buildIceServers({ ...base, turnUrls: ["turns:turn.example.org:5349"], turnSecret: "x" }, "u");
    expect(ephemeral[1].username).toMatch(/^\d+:u$/);
  });
});
