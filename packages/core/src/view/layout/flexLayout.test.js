import { describe, expect, test } from "vitest";
import {
    mapToPixelCoords,
    getMinimumSize,
    getLargestSize,
    isStretching,
    parseSizeDef,
    sumSizeDefs,
} from "./flexLayout.js";

test("parseSize", () => {
    expect(parseSizeDef(10)).toEqual({ px: 10, grow: 0 });
    expect(parseSizeDef({ px: 20, grow: 2 })).toEqual({ px: 20, grow: 2 });
    expect(parseSizeDef(undefined)).toEqual({ px: 0, grow: 1 });
    expect(parseSizeDef(null)).toEqual({ px: 0, grow: 1 });
    expect(parseSizeDef("container")).toEqual({ px: 0, grow: 1 });
    expect(() => parseSizeDef({})).toThrow();
});

describe("Basic flex functionality", () => {
    test("Absolute sizes", () => {
        const items = [10, 30, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize);

        expect(mapped[0]).toEqual({ location: 0, size: 10 });
        expect(mapped[1]).toEqual({ location: 10, size: 30 });
        expect(mapped[2]).toEqual({ location: 40, size: 20 });
    });

    test("Absolute sizes with spacing", () => {
        const items = [10, 30, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, { spacing: 10 });

        expect(mapped[0]).toEqual({ location: 0, size: 10 });
        expect(mapped[1]).toEqual({ location: 20, size: 30 });
        expect(mapped[2]).toEqual({ location: 60, size: 20 });
    });

    test("Absolute sizes with spacing, reversed", () => {
        const items = [10, 30, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, {
            spacing: 10,
            reverse: true,
        });

        expect(mapped[0]).toEqual({ location: 90, size: 10 });
        expect(mapped[1]).toEqual({ location: 50, size: 30 });
        expect(mapped[2]).toEqual({ location: 20, size: 20 });
    });

    test("Absolute sizes with spacing, reversed and insufficient containerSize", () => {
        const items = [10, 30, 20].map((x) => ({ px: x }));
        const containerSize = 0;

        const mapped = mapToPixelCoords(items, containerSize, {
            spacing: 10,
            reverse: true,
        });

        expect(mapped[0]).toEqual({ location: 70, size: 10 });
        expect(mapped[1]).toEqual({ location: 30, size: 30 });
        expect(mapped[2]).toEqual({ location: 0, size: 20 });
    });

    test("Growing sizes", () => {
        const items = [10, 20, 70].map((x) => ({ grow: x }));
        const containerSize = 200;

        const mapped = mapToPixelCoords(items, containerSize);

        expect(mapped[0]).toEqual({ location: 0, size: 20 });
        expect(mapped[1]).toEqual({ location: 20, size: 40 });
        expect(mapped[2]).toEqual({ location: 60, size: 140 });
    });

    test("Growing sizes with spacing", () => {
        const items = [10, 20, 70].map((x) => ({ grow: x }));
        const containerSize = 220;
        const mapped = mapToPixelCoords(items, containerSize, { spacing: 10 });

        expect(mapped[0]).toEqual({ location: 0, size: 20 });
        expect(mapped[1]).toEqual({ location: 30, size: 40 });
        expect(mapped[2]).toEqual({ location: 80, size: 140 });
    });

    test("Mixed absolute and relative sizes", () => {
        const items = [{ px: 100 }, { grow: 1 }, { grow: 9 }, { px: 200 }];
        const containerSize = 1100;
        const mapped = mapToPixelCoords(items, containerSize);

        expect(mapped[0]).toEqual({ location: 0, size: 100 });
        expect(mapped[1]).toEqual({ location: 100, size: 80 });
        expect(mapped[2]).toEqual({ location: 180, size: 720 });
        expect(mapped[3]).toEqual({ location: 900, size: 200 });
    });

    test("Sizes having both absolute and growing components", () => {
        const items = [
            { px: 1 },
            { px: 2 },
            { px: 3, grow: 2 },
            { px: 4, grow: 1 },
        ];
        const containerSize = 16;
        const mapped = mapToPixelCoords(items, containerSize);

        expect(mapped[0]).toEqual({ location: 0, size: 1 });
        expect(mapped[1]).toEqual({ location: 1, size: 2 });
        expect(mapped[2]).toEqual({ location: 3, size: 7 });
        expect(mapped[3]).toEqual({ location: 10, size: 6 });
    });

    test("Zero sizes return zero coords", () => {
        const items = [{ grow: 0 }, { grow: 0 }];

        const mapped = mapToPixelCoords(items, 0);
        expect(mapped[0]).toEqual({ location: 0, size: 0 });
        expect(mapped[1]).toEqual({ location: 0, size: 0 });

        const mapped2 = mapToPixelCoords(items, 1);
        expect(mapped2[0]).toEqual({ location: 0, size: 0 });
        expect(mapped2[1]).toEqual({ location: 0, size: 0 });
    });

    test("Offset is added", () => {
        const items = [10, 30, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, { offset: 5 });

        expect(mapped[0]).toEqual({ location: 5, size: 10 });
        expect(mapped[1]).toEqual({ location: 15, size: 30 });
        expect(mapped[2]).toEqual({ location: 45, size: 20 });
    });
});

describe("Collapse gaps when items have zero px and grow", () => {
    test("Zero as first", () => {
        const items = [0, 30, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, { spacing: 10 });

        expect(mapped[0]).toEqual({ location: 0, size: 0 });
        expect(mapped[1]).toEqual({ location: 0, size: 30 });
        expect(mapped[2]).toEqual({ location: 40, size: 20 });
    });

    test("Zero in the middle", () => {
        const items = [10, 0, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, { spacing: 10 });

        expect(mapped[0]).toEqual({ location: 0, size: 10 });
        expect(mapped[1]).toEqual({ location: 15, size: 0 });
        expect(mapped[2]).toEqual({ location: 20, size: 20 });
    });

    test("Multiple zeroes in the middle", () => {
        const items = [10, 0, 0, 0, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, { spacing: 10 });

        expect(mapped[0]).toEqual({ location: 0, size: 10 });
        expect(mapped[1]).toEqual({ location: 12.5, size: 0 });
        expect(mapped[2]).toEqual({ location: 15, size: 0 });
        expect(mapped[3]).toEqual({ location: 17.5, size: 0 });
        expect(mapped[4]).toEqual({ location: 20, size: 20 });
    });

    test("Zero as last", () => {
        const items = [10, 30, 0].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, { spacing: 10 });

        expect(mapped[0]).toEqual({ location: 0, size: 10 });
        expect(mapped[1]).toEqual({ location: 20, size: 30 });
        expect(mapped[2]).toEqual({ location: 50, size: 0 });
    });

    test("Only a zero", () => {
        const items = [0].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, { spacing: 10 });

        expect(mapped[0]).toEqual({ location: 0, size: 0 });
    });
});

describe("Collapse gaps when items have zero px and grow, reversed", () => {
    test("Zero as first", () => {
        const items = [0, 30, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, {
            spacing: 10,
            reverse: true,
        });

        expect(mapped[0]).toEqual({ location: 100, size: 0 });
        expect(mapped[1]).toEqual({ location: 70, size: 30 });
        expect(mapped[2]).toEqual({ location: 40, size: 20 });
    });

    test("Zero in the middle", () => {
        const items = [10, 0, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, {
            spacing: 10,
            reverse: true,
        });

        expect(mapped[0]).toEqual({ location: 90, size: 10 });
        expect(mapped[1]).toEqual({ location: 85, size: 0 });
        expect(mapped[2]).toEqual({ location: 60, size: 20 });
    });

    test("Multiple zeroes in the middle", () => {
        const items = [10, 0, 0, 0, 20].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, {
            spacing: 10,
            reverse: true,
        });

        expect(mapped[0]).toEqual({ location: 90, size: 10 });
        expect(mapped[1]).toEqual({ location: 87.5, size: 0 });
        expect(mapped[2]).toEqual({ location: 85, size: 0 });
        expect(mapped[3]).toEqual({ location: 82.5, size: 0 });
        expect(mapped[4]).toEqual({ location: 60, size: 20 });
    });

    test("Zero as last", () => {
        const items = [10, 30, 0].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, {
            spacing: 10,
            reverse: true,
        });

        expect(mapped[0]).toEqual({ location: 90, size: 10 });
        expect(mapped[1]).toEqual({ location: 50, size: 30 });
        expect(mapped[2]).toEqual({ location: 50, size: 0 });
    });

    test("Only a zero", () => {
        const items = [0].map((x) => ({ px: x }));
        const containerSize = 100;

        const mapped = mapToPixelCoords(items, containerSize, {
            spacing: 10,
            reverse: true,
        });

        expect(mapped[0]).toEqual({ location: 100, size: 0 });
    });
});

describe("Utility fuctions", () => {
    test("sumSizeDefs", () => {
        const items = [
            { px: 100 },
            { px: 10, grow: 1 },
            { grow: 9 },
            { px: 200 },
        ];

        expect(sumSizeDefs(items)).toEqual({ px: 310, grow: 10 });
    });

    test("getMinimumSize", () => {
        const items = [{ px: 100 }, { grow: 1 }, { grow: 9 }, { px: 200 }];

        expect(getMinimumSize(items)).toEqual(300);

        expect(getMinimumSize(items, { spacing: 10 })).toEqual(330);
    });

    test("getMinimumSize, items include zeroes", () => {
        const items = [
            { px: 100 },
            { px: 0, grow: 0 },
            { grow: 1 },
            { grow: 9 },
            { px: 200 },
        ];

        expect(getMinimumSize(items)).toEqual(300);

        expect(getMinimumSize(items, { spacing: 10 })).toEqual(330);
    });

    test("getLargestSize", () => {
        const items = [
            { px: 100 },
            { px: 0, grow: 0 },
            { grow: 1 },
            { grow: 9 },
            { px: 200 },
            { px: 50 },
        ];

        expect(getLargestSize(items)).toEqual({ px: 200, grow: 9 });
    });

    test("isStretching", () => {
        expect(isStretching([{ grow: 1 }])).toBeTruthy();
        expect(isStretching([{ px: 1 }])).toBeFalsy();
    });
});
