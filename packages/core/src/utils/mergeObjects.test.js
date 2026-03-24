import { expect, test, vi } from "vitest";
import mergeObjects from "./mergeObjects.js";

test("Merges non-conflicting properties", () => {
    expect(mergeObjects([{ a: 1 }, { b: 2 }], "test")).toEqual({ a: 1, b: 2 });

    expect(mergeObjects([{ a: [0, 1] }, { b: [2, 3] }], "test")).toEqual({
        a: [0, 1],
        b: [2, 3],
    });
});

test("Skips conflicting properties", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
        // Ignore the expected conflict warning in this test.
    });

    expect(
        mergeObjects(
            [
                { a: 1, b: 2, c: 3 },
                { b: 5, d: 4 },
            ],
            "test"
        )
    ).toEqual({ a: 1, b: 2, c: 3, d: 4 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
        "Conflicting property b of test: (2 and 5). Using 2."
    );

    warn.mockRestore();
});

test("Null is handled correctly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
        // Ignore the expected null-merge warning in this test.
    });

    expect(mergeObjects([null, null, null], "test")).toBeNull();
    expect(() => mergeObjects([{ a: 1 }, null, { b: 2 }], "test")).toThrow(
        "Cannot merge objects with nulls!"
    );
    expect(warn).toHaveBeenCalledWith([{ a: 1 }, null, { b: 2 }]);

    warn.mockRestore();
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
