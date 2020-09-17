import FlexLayout, { parseSizeDef } from "./flexLayout";

test("parseSize", () => {
    expect(parseSizeDef(10)).toEqual({ px: 10, grow: 0 });
    expect(parseSizeDef({ px: 20, grow: 2 })).toEqual({ px: 20, grow: 2 });
    expect(parseSizeDef(undefined)).toEqual({ px: 0, grow: 1 });
    expect(parseSizeDef(null)).toEqual({ px: 0, grow: 1 });
    expect(() => parseSizeDef({})).toThrow();
});

test("Absolute sizes", () => {
    const items = [10, 30, 20].map(x => ({ px: x }));
    const layout = new FlexLayout(
        items,
        x => x,
        () => ({ px: 100 })
    );

    expect(layout.getPixelSize(items[0])).toEqual([0, 10]);
    expect(layout.getPixelSize(items[1])).toEqual([10, 40]);
    expect(layout.getPixelSize(items[2])).toEqual([40, 60]);
});

test("Growing sizes", () => {
    const items = [10, 20, 70].map(x => ({ grow: x }));
    const layout = new FlexLayout(
        items,
        x => x,
        () => ({ px: 200 })
    );

    expect(layout.getPixelSize(items[0])).toEqual([0, 20]);
    expect(layout.getPixelSize(items[1])).toEqual([20, 60]);
    expect(layout.getPixelSize(items[2])).toEqual([60, 200]);
});

test("Mixed absolute and relative sizes", () => {
    const items = [{ px: 100 }, { grow: 1 }, { grow: 9 }, { px: 200 }];
    const layout = new FlexLayout(
        items,
        x => x,
        () => ({ px: 1100 })
    );

    expect(layout.getPixelSize(items[0])).toEqual([0, 100]);
    expect(layout.getPixelSize(items[1])).toEqual([100, 180]);
    expect(layout.getPixelSize(items[2])).toEqual([180, 900]);
    expect(layout.getPixelSize(items[3])).toEqual([900, 1100]);
});

test("Sizes having both absolute and growing components", () => {
    const items = [
        { px: 1 },
        { px: 2 },
        { px: 3, grow: 2 },
        { px: 4, grow: 1 }
    ];
    const layout = new FlexLayout(
        items,
        x => x,
        () => ({ px: 16 })
    );

    expect(layout.getPixelSize(items[0])).toEqual([0, 1]);
    expect(layout.getPixelSize(items[1])).toEqual([1, 3]);
    expect(layout.getPixelSize(items[2])).toEqual([3, 10]);
    expect(layout.getPixelSize(items[3])).toEqual([10, 16]);
});

test("Normalized calculations", () => {
    const items = [10, 30, 20].map(x => ({ px: x }));
    const layout = new FlexLayout(
        items,
        x => x,
        () => ({ px: 100 })
    );

    expect(layout.getNormalizedSize(items[0])).toEqual([0, 0.1]);
    expect(layout.getNormalizedSize(items[1])).toEqual([0.1, 0.4]);
    expect(layout.getNormalizedSize(items[2])).toEqual([0.4, 0.6]);
});

test("getMinimumSize", () => {
    const items = [{ px: 100 }, { grow: 1 }, { grow: 9 }, { px: 200 }];
    const layout = new FlexLayout(
        items,
        x => x,
        () => ({ px: 1100 })
    );

    expect(layout.getMinimumSize()).toEqual(300);
});

test("isStretching", () => {
    const layout = new FlexLayout(
        [{ grow: 1 }],
        x => x,
        () => ({ px: 100 })
    );
    expect(layout.isStretching()).toBeTruthy();

    const layout2 = new FlexLayout(
        [{ px: 1 }],
        x => x,
        () => ({ px: 100 })
    );
    expect(layout2.isStretching()).toBeFalsy();
});
