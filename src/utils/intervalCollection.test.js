import IntervalCollection from "./intervalCollection";
import Interval from "./interval";

test("Add", () => {

    const reference = [
        new Interval(0, 1),
        new Interval(1, 2),
        new Interval(2, 3),
        new Interval(3, 4),
        new Interval(4, 5),
        new Interval(6, 7),
        new Interval(7, 10),
        new Interval(11, 15)
    ];

    const c = new IntervalCollection();
    c.add(new Interval(0, 1));
    c.add(new Interval(1, 2));
    c.add(new Interval(2, 3));
    c.add(new Interval(4, 5));
    c.add(new Interval(3, 4));
    c.add(new Interval(7, 10));
    c.add(new Interval(11, 15));
    c.add(new Interval(6, 7));

    expect(c.toArray()).toEqual(reference);
});

test("Fail addition if no room", () => {
    const c = new IntervalCollection();
    c.add(new Interval(0, 5));
    c.add(new Interval(7, 10));

    expect(() => c.add(new Interval(4, 6))).toThrow();
    expect(() => c.add(new Interval(6, 8))).toThrow();
    expect(() => c.add(new Interval(4, 8))).toThrow();
    expect(() => c.add(new Interval(9, 11))).toThrow();
    expect(() => c.add(new Interval(1, 2))).toThrow();
    expect(() => c.add(new Interval(-2, 1))).toThrow();
});

test("Overlaps", () => {
    const c = new IntervalCollection();
    c.add(new Interval(1, 2));
    c.add(new Interval(5, 6));

    expect(c.overlaps(new Interval(0, 1))).toBeFalsy();
    expect(c.overlaps(new Interval(0, 3))).toBeTruthy();
    expect(c.overlaps(new Interval(0, 10))).toBeTruthy();
    expect(c.overlaps(new Interval(10, 20))).toBeFalsy();
});

test("Interval At", () => {
    const c = new IntervalCollection();
    c.add(new Interval(0, 1));
    c.add(new Interval(1, 2));
    c.add(new Interval(2, 3));
    c.add(new Interval(3, 4));
    c.add(new Interval(4, 5));
    c.add(new Interval(6, 7));
    c.add(new Interval(7, 10));
    c.add(new Interval(11, 15));

    expect(c.intervalAt(3)).toEqual(new Interval(3, 4));
    expect(c.intervalAt(3.5)).toEqual(new Interval(3, 4));
    expect(c.intervalAt(4)).toEqual(new Interval(4, 5));

    expect(c.intervalAt(-100)).toBeNull();
    expect(c.intervalAt(10.5)).toBeNull();
    expect(c.intervalAt(100)).toBeNull();
});

test("Accessor", () => { 
    const create = (id, lower, upper) => ({
        id: id,
        interval: new Interval(lower, upper)
    });

    const c = new IntervalCollection(x => x.interval);
    c.add(create("a", 0, 2));
    c.add(create("b", 3, 5));

    expect(c.intervalAt(1).id).toEqual("a");
    expect(c.intervalAt(4).id).toEqual("b");
    expect(c.intervalAt(100)).toBeNull();
});
