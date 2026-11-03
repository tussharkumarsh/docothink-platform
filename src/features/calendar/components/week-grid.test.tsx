import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/doctor/actions", () => ({ deleteExceptionAction: vi.fn(), addExceptionAction: vi.fn() }));

const { BlockChip } = await import("./week-grid");

const block = { id: "b1", starts_at: "2026-11-03T10:00:00Z", ends_at: "2026-11-03T11:00:00Z", reason: "Lunch" };

describe("BlockChip", () => {
  it("shows when the block is as text, for the phone list where there's no grid position", () => {
    const html = renderToStaticMarkup(<BlockChip b={block} timezone="UTC" />);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toMatch(/10:00/);
    expect(text).toMatch(/11:00/);
  });

  it("gives the remove control a 44px target on phones", () => {
    expect(renderToStaticMarkup(<BlockChip b={block} timezone="UTC" />)).toContain("size-11");
  });
});
