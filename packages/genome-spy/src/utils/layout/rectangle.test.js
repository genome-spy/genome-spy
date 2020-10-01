import Rectangle from "./rectangle";
import Padding from "./padding";

test("Rectangle creation", () => {
    const r = new Rectangle(1, 2, 3, 4);
    expect(r.x).toEqual(1);
    expect(r.y).toEqual(2);
    expect(r.width).toEqual(3);
    expect(r.height).toEqual(4);
});

test("x2 and y2 calculation", () => {
    const r = new Rectangle(1, 2, 3, 4);
    expect(r.x2).toEqual(4);
    expect(r.y2).toEqual(6);
});

test("translate", () => {
    const r = new Rectangle(1, 2, 3, 4).translate(2, 3);
    expect(r.x).toEqual(3);
    expect(r.y).toEqual(5);
    expect(r.width).toEqual(3);
    expect(r.height).toEqual(4);
});

test("expand", () => {
    const r = new Rectangle(1, 2, 3, 4).expand(
        Padding.createFromRecord({ top: 2, right: 3, bottom: 4, left: 5 })
    );

    expect(r.x).toEqual(-4);
    expect(r.width).toEqual(11);
    expect(r.y).toEqual(0);
    expect(r.height).toEqual(10);
});

test("shrink", () => {
    const r = new Rectangle(1, 2, 3, 4).shrink(Padding.createUniformPadding(1));

    expect(r.x).toEqual(2);
    expect(r.width).toEqual(1);
    expect(r.y).toEqual(3);
    expect(r.height).toEqual(2);
});

test("containsPoint", () => {
    const r = new Rectangle(1, 2, 3, 4);

    expect(r.containsPoint(0, 0)).toBeFalsy();
    expect(r.containsPoint(0, 10)).toBeFalsy();
    expect(r.containsPoint(10, 0)).toBeFalsy();
    expect(r.containsPoint(10, 10)).toBeFalsy();

    expect(r.containsPoint(2, 0)).toBeFalsy();
    expect(r.containsPoint(2, 10)).toBeFalsy();
    expect(r.containsPoint(0, 3)).toBeFalsy();
    expect(r.containsPoint(10, 3)).toBeFalsy();

    // Inclusive corner
    expect(r.containsPoint(1, 2)).toBeTruthy();

    // Inside
    expect(r.containsPoint(2, 3)).toBeTruthy();

    // Exclusive corner
    expect(r.containsPoint(4, 6)).toBeFalsy();
});

test("normalizePoint", () => {
    const r = new Rectangle(1, 2, 6, 4);

    expect(r.normalizePoint(1, 2)).toEqual({ x: 0, y: 0 });
    expect(r.normalizePoint(7, 2)).toEqual({ x: 1, y: 0 });
    expect(r.normalizePoint(4, 4)).toEqual({ x: 0.5, y: 0.5 });
});
