import mergeObjects from "./mergeObjects";

test("Merges non-conflicting properties", () => {
    expect(mergeObjects([{ a: 1 }, { b: 2 }], "test")).toEqual({ a: 1, b: 2 });

    expect(mergeObjects([{ a: [0, 1] }, { b: [2, 3] }], "test")).toEqual({
        a: [0, 1],
        b: [2, 3]
    });
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

test("Nested objects are merged", () => {
    expect(
        mergeObjects([{ nested: { a: 1 } }, { nested: { b: 2 } }], "test")
    ).toEqual({ nested: { a: 1, b: 2 } });

    expect(
        mergeObjects([{ nested: { a: 1 } }, { nested: true }], "test")
    ).toEqual({ nested: { a: 1 } });

    expect(
        mergeObjects([{ nested: true }, { nested: { a: 1 } }], "test")
    ).toEqual({ nested: { a: 1 } });
});
