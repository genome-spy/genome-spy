import { describe, expect, test } from "vitest";
import { parseSvgPath } from "./parse.js";
import { svgPathToGlyphPath } from "./toGlyphPath.js";

describe("SVG path adaptation", () => {
    test("parses compact syntax and repeated arguments", () => {
        expect(parseSvgPath("M0,0 1,1L2,2 3,3Z")).toEqual([
            ["M", 0, 0],
            ["L", 1, 1],
            ["L", 2, 2],
            ["L", 3, 3],
            ["Z"],
        ]);
    });

    test("normalizes relative, smooth, and arc commands", () => {
        const path = svgPathToGlyphPath(
            "m0 0h2v2q-1 1-2 0t-2 0a1 1 0 0 1 2-2z"
        );
        expect(path.commands[0]).toEqual({ type: "M", x: 0, y: 0 });
        expect(path.commands.some((command) => command.type === "Q")).toBe(
            true
        );
        expect(path.commands.some((command) => command.type === "C")).toBe(
            true
        );
        expect(path.commands.at(-1)).toEqual({ type: "Z" });
        expect(path.bounds).not.toBeNull();
    });

    test("rejects malformed input", () => {
        expect(() => parseSvgPath("M 1 nope")).toThrow(/invalid svg path/i);
        expect(() => parseSvgPath("not a path")).toThrow(/invalid svg path/i);
    });
});
