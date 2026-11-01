import { describe, expect, it } from "vitest";
import { csvCell, csvBody } from "./csv";

describe("csvCell", () => {
  it("quotes every cell and doubles embedded quotes", () => {
    expect(csvCell('Dr "A" Rao')).toBe('"Dr ""A"" Rao"');
    expect(csvCell(1458)).toBe('"1458"');
    expect(csvCell(null)).toBe('""');
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("@x")).toBe(`"'@x"`);
  });
});

describe("csvBody", () => {
  it("joins a header and rows with CRLF", () => {
    expect(csvBody(["a", "b"], [[1, "x"]])).toBe('"a","b"\r\n"1","x"');
  });
});
