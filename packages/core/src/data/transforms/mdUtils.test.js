import { describe, expect, test } from "vitest";
import { parseMdTag } from "./mdUtils.js";

describe("MD tag utilities", () => {
    test("parses MD tags into mismatch and deletion events", () => {
        expect(parseMdTag("101")).toEqual([]);
        expect(parseMdTag("10A5^AC6")).toEqual([
            { type: "mismatch", refOffset: 10, refBase: "A" },
            { type: "deletion", refOffset: 16, refBases: "AC" },
        ]);
    });

    test("supports adjacent mismatches separated by zero-length matches", () => {
        expect(parseMdTag("0A0C10")).toEqual([
            { type: "mismatch", refOffset: 0, refBase: "A" },
            { type: "mismatch", refOffset: 1, refBase: "C" },
        ]);
    });

    test.each(["", "10^5", "10A^", "10a5", "10A", "10^AC"])(
        "rejects malformed MD tag %j",
        (md) => {
            expect(() => parseMdTag(md)).toThrow(/Malformed MD tag/);
        }
    );
});
