import { expect, test } from "vitest";
import Rectangle from "./rectangle.js";
import Padding from "./padding.js";

test("Rectangle creation", () => {
    const r = Rectangle.create(1, 2, 3, 4);
    expect(r.x).toEqual(1);
    expect(r.y).toEqual(2);
    expect(r.width).toEqual(3);
    expect(r.height).toEqual(4);
});

test("equals", () => {
    const r = Rectangle.create(1, 2, 3, 4);
    expect(r.equals(r)).toBeTruthy();
    expect(r.equals(Rectangle.create(1, 2, 3, 4))).toBeTruthy();
    expect(r.equals(undefined)).toBeFalsy();
});

test("x2 and y2 calculation", () => {
    const r = Rectangle.create(1, 2, 3, 4);
    expect(r.x2).toEqual(4);
    expect(r.y2).toEqual(6);
});

test("translate", () => {
    const r = Rectangle.create(1, 2, 3, 4).translate(2, 3);
    expect(r.x).toEqual(3);
    expect(r.y).toEqual(5);
    expect(r.width).toEqual(3);
    expect(r.height).toEqual(4);
});

test("Dynamic translate", () => {
    let tx = 0;
    let ty = 0;

    const r = Rectangle.create(1, 2, 3, 4)
        .translate(
            () => tx,
            () => ty
        )
        .translate(2, 3);

    expect(r.x).toEqual(3);
    expect(r.y).toEqual(5);
    expect(r.width).toEqual(3);
    expect(r.height).toEqual(4);

    tx = 1;
    ty = 2;

    expect(r.x).toEqual(4);
    expect(r.y).toEqual(7);
    expect(r.width).toEqual(3);
    expect(r.height).toEqual(4);
});

test("expand", () => {
    const r = Rectangle.create(1, 2, 3, 4).expand(
        Padding.createFromRecord({ top: 2, right: 3, bottom: 4, left: 5 })
    );

    expect(r.x).toEqual(-4);
    expect(r.width).toEqual(11);
    expect(r.y).toEqual(0);
    expect(r.height).toEqual(10);
});

test("shrink", () => {
    const r = Rectangle.create(1, 2, 3, 4).shrink(
        Padding.createUniformPadding(1)
    );

    expect(r.x).toEqual(2);
    expect(r.width).toEqual(1);
    expect(r.y).toEqual(3);
    expect(r.height).toEqual(2);
});

test("modify", () => {
    const r = Rectangle.create(1, 2, 3, 4);
    const m = r.modify({ x: 5 });

    expect(m.equals(r)).toBeFalsy();
    expect(m.equals(Rectangle.create(5, 2, 3, 4))).toBeTruthy();
});

test("Dynamic modify", () => {
    let x = 1;
    const r = Rectangle.create(1, 2, 3, 4);
    const m = r.modify({ x: () => x });

    expect(m.equals(r)).toBeTruthy();
    expect(m.equals(Rectangle.create(1, 2, 3, 4))).toBeTruthy();

    x = 5;

    expect(m.equals(r)).toBeFalsy();
    expect(m.equals(Rectangle.create(5, 2, 3, 4))).toBeTruthy();
});

test("intersect", () => {
    const a = Rectangle.create(1, 1, 6, 3);
    const b = Rectangle.create(5, 2, 3, 4);
    const c = Rectangle.create(5, 2, 2, 2);

    expect(a.intersect(b).equals(c)).toBeTruthy();
    expect(a.intersect(b).isDefined()).toBeTruthy();

    const x = Rectangle.create(1, 1, 1, 1);
    const y = Rectangle.create(3, 3, 1, 1);

    expect(x.intersect(y).isDefined()).toBeFalsy();
});

test("union", () => {
    const a = Rectangle.create(1, 1, 6, 3);
    const b = Rectangle.create(5, 2, 3, 4);
    const c = Rectangle.create(1, 1, 7, 5);

    expect(a.union(b).equals(c)).toBeTruthy();
});

test("isDefined", () => {
    expect(Rectangle.create(0, 0, 1, 1).isDefined()).toBeTruthy();
    expect(Rectangle.create(0, 0, 0, 0).isDefined()).toBeTruthy();

    expect(Rectangle.create(0, 0, -1, 0).isDefined()).toBeFalsy();
    expect(Rectangle.create(0, 0, 0, -1).isDefined()).toBeFalsy();
});

test("flatten", () => {
    let tx = 0;
    let ty = 0;

    const r = Rectangle.create(1, 2, 3, 4).translate(
        () => tx,
        () => ty
    );

    const flattened = r.flatten();

    tx = -1;
    ty = -2;

    expect(r.equals(Rectangle.create(0, 0, 3, 4)));
    expect(flattened.equals(Rectangle.create(1, 2, 3, 4)));
});

test("containsPoint", () => {
    const r = Rectangle.create(1, 2, 3, 4);

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
    const r = Rectangle.create(1, 2, 6, 4);

    expect(r.normalizePoint(1, 2)).toEqual({ x: 0, y: 0 });
    expect(r.normalizePoint(7, 2)).toEqual({ x: 1, y: 0 });
    expect(r.normalizePoint(4, 4)).toEqual({ x: 0.5, y: 0.5 });
});
