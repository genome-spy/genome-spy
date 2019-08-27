import DiscreteDomain from './discreteDomain';

test("Creates an empty domain", () => {
    expect(new DiscreteDomain().toArray()).toEqual([]);
});

test("Creates a non-empty domain", () => {
    expect(new DiscreteDomain(["A", "B"]).toArray()).toEqual(["A", "B"]);
});

test("Create from a set", () => {
    expect(new DiscreteDomain(new Set(["A"])).toArray()).toEqual(["A"]);
});

test("Appends new items to the end", () => {
    let d;
    d = new DiscreteDomain(["A", "B"]);
    d.add("C");
    expect(d.toArray()).toEqual(["A", "B", "C"]);
    d = new DiscreteDomain(["A", "B"]);
    d.add(["C", "D"]);
    expect(d.toArray()).toEqual(["A", "B", "C", "D"]);
});

test("Does not add duplicates", () => {
    const d = new DiscreteDomain(["A", "B"]);
    d.add(["B", "C"]);
    expect(d.toArray()).toEqual(["A", "B", "C"]);
});

test("Preserves order of existing elements", () => {
    const d = new DiscreteDomain(["A", "C"]);
    d.add(["B", "D"]);
    expect(d.toArray()).toEqual(["A", "C", "B", "D"]);
});

test("Add() returns number of added elements", () => {
    expect(new DiscreteDomain(["A", "C", "X"]).add(["A", "B", "C", "D", "E"])).toBe(3);
});