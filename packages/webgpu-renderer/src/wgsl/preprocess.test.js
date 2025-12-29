import { describe, expect, it } from "vitest";
import { preprocessShader } from "./preprocess.js";

describe("preprocessShader", () => {
    it("handles ifdef/else blocks", () => {
        const src = `
#define FOO
line1
#ifdef FOO
line2
#else
line3
#endif
line4
`;
        const out = preprocessShader(src);
        expect(out).toContain("line1");
        expect(out).toContain("line2");
        expect(out).not.toContain("line3");
        expect(out).toContain("line4");
    });

    it("handles ifndef blocks", () => {
        const src = `
#ifndef MISSING
lineA
#endif
`;
        const out = preprocessShader(src);
        expect(out).toContain("lineA");
    });

    it("handles defined() expressions", () => {
        const src = `
#define FLAG
#if defined(FLAG)
yes
#else
no
#endif
`;
        const out = preprocessShader(src);
        expect(out).toContain("yes");
        expect(out).not.toContain("no");
    });

    it("handles compound expressions", () => {
        const src = `
#define ROUNDED_CORNERS
#define STROKED
#if defined(ROUNDED_CORNERS) || defined(STROKED) || defined(SHADOW)
hit
#endif
`;
        const out = preprocessShader(src);
        expect(out).toContain("hit");
    });

    it("handles && and !defined", () => {
        const src = `
#define A
#if defined(A) && !defined(B)
yes
#else
no
#endif
`;
        const out = preprocessShader(src);
        expect(out).toContain("yes");
        expect(out).not.toContain("no");
    });

    it("skips defines in inactive blocks", () => {
        const src = `
#if 0
#define LATER
#endif
#ifdef LATER
hit
#endif
`;
        const out = preprocessShader(src);
        expect(out).not.toContain("hit");
    });

    it("handles nested conditionals", () => {
        const src = `
#define A
#ifdef A
#ifdef B
x
#else
y
#endif
#endif
`;
        const out = preprocessShader(src);
        expect(out).toContain("y");
        expect(out).not.toContain("x");
    });
});
