import { describe, it, expect } from "vitest";
import {
    escapeSlash,
    unescapeSlash,
    joinPathParts,
    splitPath,
} from "./escapeSlash.js";

describe("escapeSlash / unescapeSlash", () => {
    it("escapes forward slashes", () => {
        expect(escapeSlash("/a/b/c")).toBe("\\/a\\/b\\/c");
    });

    it("unescapes escaped forward slashes", () => {
        expect(unescapeSlash("\\/a\\/b\\/c")).toBe("/a/b/c");
    });

    it("roundtrips (escape -> unescape)", () => {
        const s = "/path/to/resource";
        expect(unescapeSlash(escapeSlash(s))).toBe(s);
    });

    it("leaves strings without slashes untouched", () => {
        expect(escapeSlash("abc")).toBe("abc");
        expect(unescapeSlash("abc")).toBe("abc");
    });

    it("joinPathParts and splitPath roundtrip", () => {
        const parts = ["a", "b/c", "d", "e/f/g"];
        const joined = joinPathParts(parts);
        expect(splitPath(joined)).toEqual(parts);
    });

    it("handles empty parts and leading/trailing empty parts", () => {
        const parts = ["", "a", "b/c", ""];
        const joined = joinPathParts(parts);
        expect(splitPath(joined)).toEqual(parts);
    });

    it("supports custom separator characters", () => {
        const parts = ["a", "b|c", "", "d"];
        const sep = "|";
        const joined = joinPathParts(parts, sep);
        expect(joined).toBe("a|b\\|c||d");
        expect(splitPath(joined, sep)).toEqual(parts);
    });

    it("handles separators with regex special characters", () => {
        const parts = ["a", "b.c", "d"];
        const sep = ".";
        const joined = joinPathParts(parts, sep);
        expect(joined).toBe("a.b\\.c.d");
        expect(splitPath(joined, sep)).toEqual(parts);
    });

    it("handles multi-character separators", () => {
        const parts = ["a", "b::c", "d::e::f"];
        const sep = "::";
        const joined = joinPathParts(parts, sep);
        expect(joined).toBe("a::b\\::c::d\\::e\\::f");
        expect(splitPath(joined, sep)).toEqual(parts);
    });

    it("escapeSlash and unescapeSlash are inverses", () => {
        const str = "a/b/c";
        expect(unescapeSlash(escapeSlash(str))).toBe(str);
    });

    it("handles consecutive separators", () => {
        const parts = ["a", "", "b", "", "c"];
        const joined = joinPathParts(parts);
        expect(splitPath(joined)).toEqual(parts);
    });

    it("handles single part with no separators", () => {
        const parts = ["single"];
        expect(joinPathParts(parts)).toBe("single");
        expect(splitPath("single")).toEqual(parts);
    });

    it("handles parts containing backslashes (not escaped separators)", () => {
        const parts = ["a\\b", "c"];
        const joined = joinPathParts(parts);
        expect(splitPath(joined)).toEqual(parts);
    });
});
