import Interval from "./interval";

test("Negative interval fails", () => {
    expect(() => new Interval(2, 1)).toThrow();
});

test("Non-numeric interval fails", () => {
    expect(() => new Interval("qwerty", 1)).toThrow();
    expect(() => new Interval(1, "qwerty")).toThrow();
});

test("FromArray", () => {
    expect(Interval.fromArray([1, 2])).toEqual(new Interval(1, 2));
});

test("Equals", () => {
    const interval = new Interval(1, 3);
    expect(interval.equals(new Interval(1, 3))).toEqual(true);
    expect(interval.equals(new Interval(2, 3))).toEqual(false);
});

test("Contains", () => {
    const interval = new Interval(1, 3);
    expect(interval.contains(0)).toEqual(false);
    expect(interval.contains(1)).toEqual(true);
    expect(interval.contains(2)).toEqual(true);
    expect(interval.contains(2.999999)).toEqual(true);
    expect(interval.contains(3)).toEqual(false);
    expect(interval.contains(3)).toEqual(false);
});

test("Encloses", () => {
    const interval = new Interval(1, 3);
    expect(interval.encloses(new Interval(0, 0.5))).toEqual(false);
    expect(interval.encloses(new Interval(0, 1))).toEqual(false);
    expect(interval.encloses(new Interval(0, 2))).toEqual(false);
    expect(interval.encloses(new Interval(1, 2))).toEqual(true);
    expect(interval.encloses(new Interval(1, 3))).toEqual(true);
    expect(interval.encloses(new Interval(2, 3))).toEqual(true);
    expect(interval.encloses(new Interval(3, 4))).toEqual(false);
    expect(interval.encloses(new Interval(0, 4))).toEqual(false);
});

test("Empty", () => {
    expect(new Interval(1, 1).empty()).toEqual(true);
    expect(new Interval(1, 2).empty()).toEqual(false);
});

test("Width", () => {
    expect(new Interval(1, 2).width()).toEqual(1);
});

test("Centre", () => {
    expect(new Interval(1, 3).centre()).toEqual(2);
});

test("ConnectedWith", () => {
    const interval = new Interval(3, 6);
    expect(interval.connectedWith(new Interval(1, 2))).toEqual(false);
    expect(interval.connectedWith(new Interval(1, 3))).toEqual(true);
    expect(interval.connectedWith(new Interval(1, 4))).toEqual(true);
    expect(interval.connectedWith(new Interval(1, 6))).toEqual(true);
    expect(interval.connectedWith(new Interval(1, 7))).toEqual(true);
    expect(interval.connectedWith(new Interval(3, 4))).toEqual(true);
    expect(interval.connectedWith(new Interval(3, 6))).toEqual(true);
    expect(interval.connectedWith(new Interval(3, 7))).toEqual(true);
    expect(interval.connectedWith(new Interval(6, 7))).toEqual(true);
    expect(interval.connectedWith(new Interval(7, 8))).toEqual(false);
});

test("Intersect", () => {
    const interval = new Interval(3, 6);
    expect(interval.intersect(new Interval(1, 2))).toBeNull();
    expect(interval.intersect(new Interval(1, 3))).toBeNull();
    expect(interval.intersect(new Interval(1, 4))).toEqual(new Interval(3, 4));
    expect(interval.intersect(new Interval(4, 5))).toEqual(new Interval(4, 5));
    expect(interval.intersect(new Interval(3, 6))).toEqual(new Interval(3, 6));
    expect(interval.intersect(new Interval(5, 7))).toEqual(new Interval(5, 6));
    expect(interval.intersect(new Interval(6, 7))).toBeNull();
    expect(interval.intersect(new Interval(7, 8))).toBeNull();
});

test("Span", () => {
    const interval = new Interval(1, 2);
    expect(interval.span(null)).toEqual(interval);
    expect(interval.span(null)).not.toBe(interval);

    expect(new Interval(1, 2).span(new Interval(1, 2))).toEqual(new Interval(1, 2));
    expect(new Interval(1, 2).span(new Interval(4, 5))).toEqual(new Interval(1, 5));
    expect(new Interval(4, 5).span(new Interval(1, 2))).toEqual(new Interval(1, 5));
});

test("Transform", () => {
    const f = x => 10 * x;
    expect(new Interval(1, 2).transform(f)).toEqual(new Interval(10, 20));
});

test("Copy", () => {
    const interval = new Interval(1, 2);

    expect(interval.copy()).toEqual(interval);
    expect(interval.copy()).not.toBe(interval);
});

test("WithLower", () => {
    const interval = new Interval(1, 2);
    expect(interval.withLower(0)).toEqual(new Interval(0, 2));
    expect(interval.withLower(0)).not.toBe(interval);
});

test("WithUpper", () => {
    const interval = new Interval(1, 2);
    expect(interval.withUpper(3)).toEqual(new Interval(1, 3));
    expect(interval.withUpper(3)).not.toBe(interval);
});

test("ToString", () => {
    expect(new Interval(1, 2).toString()).toEqual("[1, 2)");
});