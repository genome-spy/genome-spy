import { describe, expect, test } from "vitest";
import { Reader } from "./reader.js";
import {
    parseGposKerning,
    parseLegacyKerning,
    parsePairAdjustment,
} from "./positioning.js";

/** @param {number[][]} values */
function bytes(...values) {
    return values.flat();
}

/** @param {number} value */
function u16(value) {
    return [(value >>> 8) & 0xff, value & 0xff];
}

/** @param {number} value */
function i16(value) {
    return u16(value & 0xffff);
}

/** @param {number} value */
function u32(value) {
    return [
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    ];
}

/** @param {string} value */
function tag(value) {
    return Array.from(value, (character) => character.charCodeAt(0));
}

function createGposFixture() {
    const languageSystem = bytes(u16(0), u16(0xffff), u16(1), u16(0));
    const script = bytes(u16(4), u16(0), languageSystem);
    const scriptList = bytes(u16(1), tag("latn"), u16(8), script);

    const feature = bytes(u16(0), u16(2), u16(0), u16(1));
    const featureList = bytes(u16(1), tag("kern"), u16(8), feature);

    const pairSet = bytes(u16(1), u16(5), i16(-3), i16(-80), i16(-10), i16(-4));
    const coverage = bytes(u16(1), u16(1), u16(3));
    const pairFormat1 = bytes(
        u16(1),
        u16(12),
        u16(0x0005),
        u16(0x0005),
        u16(1),
        u16(18),
        coverage,
        pairSet
    );
    const lookup0 = bytes(u16(2), u16(0), u16(1), u16(8), pairFormat1);

    const classMatrix = bytes(i16(0), i16(0), i16(0), i16(-15));
    const classDefinition1 = bytes(u16(1), u16(3), u16(1), u16(1));
    const classDefinition2 = bytes(u16(1), u16(5), u16(1), u16(1));
    const pairFormat2 = bytes(
        u16(2),
        u16(24),
        u16(0x0004),
        u16(0),
        u16(30),
        u16(38),
        u16(2),
        u16(2),
        classMatrix,
        coverage,
        classDefinition1,
        classDefinition2
    );
    const extension = bytes(u16(1), u16(2), u32(8), pairFormat2);
    const lookup1 = bytes(u16(9), u16(0), u16(1), u16(8), extension);
    const lookupList = bytes(
        u16(2),
        u16(6),
        u16(6 + lookup0.length),
        lookup0,
        lookup1
    );

    return new Uint8Array(
        bytes(
            u16(1),
            u16(0),
            u16(10),
            u16(10 + scriptList.length),
            u16(10 + scriptList.length + featureList.length),
            scriptList,
            featureList,
            lookupList
        )
    );
}

function createLegacyKernFixture() {
    return new Uint8Array(
        bytes(
            u16(0),
            u16(1),
            u16(0),
            u16(20),
            u16(0x0001),
            u16(1),
            u16(0),
            u16(0),
            u16(0),
            u16(3),
            u16(5),
            i16(-70)
        )
    );
}

describe("OpenType pair positioning", () => {
    test("combines explicit and extension-wrapped class kerning", () => {
        const getAdjustment = parseGposKerning(new Reader(createGposFixture()));

        expect(getAdjustment(3, 5)).toEqual({
            firstPlacement: -3,
            firstAdvance: -95,
            secondPlacement: -10,
            secondAdvance: -4,
        });
        expect(getAdjustment(4, 5)).toEqual({
            firstPlacement: 0,
            firstAdvance: 0,
            secondPlacement: 0,
            secondAdvance: 0,
        });
    });

    test("reads horizontal legacy kern format zero", () => {
        const getAdjustment = parseLegacyKerning(
            new Reader(createLegacyKernFixture())
        );

        expect(getAdjustment(3, 5)).toEqual({
            firstPlacement: 0,
            firstAdvance: -70,
            secondPlacement: 0,
            secondAdvance: 0,
        });
        expect(getAdjustment(5, 3).firstAdvance).toBe(0);
    });

    test("prefers usable GPOS and otherwise falls back to legacy kern", () => {
        const gpos = createGposFixture();
        const kern = createLegacyKernFixture();
        const source = new Uint8Array(gpos.length + kern.length);
        source.set(gpos);
        source.set(kern, gpos.length);
        const tables = new Map([
            ["GPOS", { offset: 0, length: gpos.length }],
            ["kern", { offset: gpos.length, length: kern.length }],
        ]);

        expect(
            parsePairAdjustment(new Reader(source), tables)(3, 5).firstAdvance
        ).toBe(-95);
        expect(
            parsePairAdjustment(
                new Reader(source),
                new Map([["kern", tables.get("kern")]])
            )(3, 5).firstAdvance
        ).toBe(-70);
    });
});
