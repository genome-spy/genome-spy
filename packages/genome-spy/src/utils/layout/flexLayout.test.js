import FlexLayout, { parseSizeDef } from "./flexLayout";

test("parseSize", () => {
    expect(parseSizeDef(10)).toEqual({ px: 10, grow: 0 });
    expect(parseSizeDef({ px: 20, grow: 2 })).toEqual({ px: 20, grow: 2 });
    expect(parseSizeDef(undefined)).toEqual({ px: 0, grow: 1 });
    expect(parseSizeDef(null)).toEqual({ px: 0, grow: 1 });
    expect(parseSizeDef("container")).toEqual({ px: 0, grow: 1 });
    expect(() => parseSizeDef({})).toThrow();
});

test("Absolute sizes", () => {
    const items = [10, 30, 20].map(x => ({ px: x }));
    const containerSize = 100;
    const layout = new FlexLayout(items, x => x);

    expect(layout.getPixelCoords(items[0], containerSize)).toEqual({
        location: 0,
        size: 10
    });
    expect(layout.getPixelCoords(items[1], containerSize)).toEqual({
        location: 10,
        size: 30
    });
    expect(layout.getPixelCoords(items[2], containerSize)).toEqual({
        location: 40,
        size: 20
    });
});

test("Absolute sizes with spacing", () => {
    const items = [10, 30, 20].map(x => ({ px: x }));
    const containerSize = 100;
    const spacing = 10;
    const layout = new FlexLayout(items, x => x);

    expect(layout.getPixelCoords(items[0], containerSize, spacing)).toEqual({
        location: 0,
        size: 10
    });
    expect(layout.getPixelCoords(items[1], containerSize, spacing)).toEqual({
        location: 20,
        size: 30
    });
    expect(layout.getPixelCoords(items[2], containerSize, spacing)).toEqual({
        location: 60,
        size: 20
    });
});

test("Growing sizes", () => {
    const items = [10, 20, 70].map(x => ({ grow: x }));
    const containerSize = 200;
    const layout = new FlexLayout(items, x => x);

    expect(layout.getPixelCoords(items[0], containerSize)).toEqual({
        location: 0,
        size: 20
    });
    expect(layout.getPixelCoords(items[1], containerSize)).toEqual({
        location: 20,
        size: 40
    });
    expect(layout.getPixelCoords(items[2], containerSize)).toEqual({
        location: 60,
        size: 140
    });
});

test("Growing sizes with spacing", () => {
    const items = [10, 20, 70].map(x => ({ grow: x }));
    const containerSize = 220;
    const spacing = 10;
    const layout = new FlexLayout(items, x => x);

    expect(layout.getPixelCoords(items[0], containerSize, spacing)).toEqual({
        location: 0,
        size: 20
    });
    expect(layout.getPixelCoords(items[1], containerSize, spacing)).toEqual({
        location: 30,
        size: 40
    });
    expect(layout.getPixelCoords(items[2], containerSize, spacing)).toEqual({
        location: 80,
        size: 140
    });
});

test("Mixed absolute and relative sizes", () => {
    const items = [{ px: 100 }, { grow: 1 }, { grow: 9 }, { px: 200 }];
    const containerSize = 1100;
    const layout = new FlexLayout(items, x => x);

    expect(layout.getPixelCoords(items[0], containerSize)).toEqual({
        location: 0,
        size: 100
    });
    expect(layout.getPixelCoords(items[1], containerSize)).toEqual({
        location: 100,
        size: 80
    });
    expect(layout.getPixelCoords(items[2], containerSize)).toEqual({
        location: 180,
        size: 720
    });
    expect(layout.getPixelCoords(items[3], containerSize)).toEqual({
        location: 900,
        size: 200
    });
});

test("Sizes having both absolute and growing components", () => {
    const items = [
        { px: 1 },
        { px: 2 },
        { px: 3, grow: 2 },
        { px: 4, grow: 1 }
    ];
    const containerSize = 16;
    const layout = new FlexLayout(items, x => x);

    expect(layout.getPixelCoords(items[0], containerSize)).toEqual({
        location: 0,
        size: 1
    });
    expect(layout.getPixelCoords(items[1], containerSize)).toEqual({
        location: 1,
        size: 2
    });
    expect(layout.getPixelCoords(items[2], containerSize)).toEqual({
        location: 3,
        size: 7
    });
    expect(layout.getPixelCoords(items[3], containerSize)).toEqual({
        location: 10,
        size: 6
    });
});

test("Zero sizes return zero coords", () => {
    const items = [{ grow: 0 }, { grow: 0 }];
    const layout = new FlexLayout(items, x => x);

    expect(layout.getPixelCoords(items[0], 0)).toEqual({
        location: 0,
        size: 0
    });
    expect(layout.getPixelCoords(items[1], 0)).toEqual({
        location: 0,
        size: 0
    });

    expect(layout.getPixelCoords(items[0], 1)).toEqual({
        location: 0,
        size: 0
    });
    expect(layout.getPixelCoords(items[1], 1)).toEqual({
        location: 0,
        size: 0
    });
});

test("getMinimumSize", () => {
    const items = [{ px: 100 }, { grow: 1 }, { grow: 9 }, { px: 200 }];
    const layout = new FlexLayout(items, x => x);

    expect(layout.getMinimumSize()).toEqual(300);

    expect(layout.getMinimumSize(10)).toEqual(330);
});

test("isStretching", () => {
    const layout = new FlexLayout([{ grow: 1 }], x => x);
    expect(layout.isStretching()).toBeTruthy();

    const layout2 = new FlexLayout([{ px: 1 }], x => x);
    expect(layout2.isStretching()).toBeFalsy();
});
