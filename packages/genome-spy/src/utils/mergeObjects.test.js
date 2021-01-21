import mergeObjects from "./mergeObjects";

test("Merges non-conflicting properties", () => {
    expect(mergeObjects([{ a: 1 }, { b: 2 }], "test")).toEqual({ a: 1, b: 2 });
});

test("Skips conflicting properties", () => {
    expect(
        mergeObjects(
            [
                { a: 1, b: 2, c: 3 },
                { b: 5, d: 4 }
            ],
            "test"
        )
    ).toEqual({ a: 1, b: 2, c: 3, d: 4 });
});

test("Null is handled correctly", () => {
    expect(mergeObjects([null, null, null], "test")).toBeNull();
    expect(() => mergeObjects([{ a: 1 }, null, { b: 2 }], "test")).toThrow();
});
