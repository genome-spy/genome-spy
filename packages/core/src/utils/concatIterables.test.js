import { expect, test } from "vitest";
import concatIterables from "./concatIterables";

test("ConcatIterables yields all elements in the correct order", () => {
    expect([...concatIterables([1, 2], [3, 4], [5, 6, 7], [-1000])]).toEqual([
        1, 2, 3, 4, 5, 6, 7, -1000,
    ]);
});
