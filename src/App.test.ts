import { describe, expect, it } from "vitest";
import { tools } from "./data/tools";

describe("tool catalog", () => {
  it("keeps tool ids unique", () => {
    const ids = tools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not expose empty descriptions", () => {
    expect(tools.every((tool) => tool.label.trim() && tool.description.trim())).toBe(true);
  });
});
