import { describe, expect, it } from "vitest";
import { canSee, daysBetween, formatDuration, hmacSha256, matchRule, median, parseWhatsApp, validSignature } from "./logic";

const rule = (id: string, keyword: string, position: number) => ({ id, keyword, position, teamId: null, assigneeId: null, labelId: null });

describe("matchRule", () => {
  it("takes the first matching rule by position, ignoring case", () => {
    const rules = [rule("b", "refund", 2), rule("a", "ORDER", 1)];
    expect(matchRule(rules, "Refund for my order")?.id).toBe("a");
    expect(matchRule(rules, "a refund please")?.id).toBe("b");
    expect(matchRule(rules, "hello")).toBeNull();
  });
});

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(125_000)).toBe("2m 05s");
  });
});

describe("canSee", () => {
  const agent = { id: "u1", admin: false, teamIds: ["t1"] };
  it("lets agents see their teams, team-less and their own conversations", () => {
    expect(canSee(agent, { teamId: "t1", assigneeId: null })).toBe(true);
    expect(canSee(agent, { teamId: null, assigneeId: null })).toBe(true);
    expect(canSee(agent, { teamId: "t2", assigneeId: "u1" })).toBe(true);
    expect(canSee(agent, { teamId: "t2", assigneeId: "u2" })).toBe(false);
    expect(canSee({ ...agent, admin: true }, { teamId: "t2", assigneeId: "u2" })).toBe(true);
  });
});

describe("whatsapp", () => {
  it("checks signatures and reads text messages", async () => {
    const body = '{"a":1}';
    const signature = `sha256=${await hmacSha256("secret", body)}`;
    expect(await validSignature("secret", body, signature)).toBe(true);
    expect(await validSignature("other", body, signature)).toBe(false);
    expect(await validSignature("secret", body, null)).toBe(false);
    const parsed = parseWhatsApp({
      entry: [{ changes: [{ value: { contacts: [{ wa_id: "31", profile: { name: "Sam" } }], messages: [{ from: "31", id: "m1", type: "text", text: { body: "hi" }, timestamp: "10" }] } }] }],
    });
    expect(parsed).toEqual([{ waId: "31", name: "Sam", text: "hi", externalId: "m1", at: 10_000 }]);
    expect(daysBetween(Date.UTC(2026, 0, 30, 12), Date.UTC(2026, 1, 1, 1))).toEqual(["2026-01-30", "2026-01-31", "2026-02-01"]);
  });
});
