import { expect, test } from "vitest";
import { makeCustomGroupAccessor } from "./groupOperations.js";

test("makeArbitraryGroupAccessor", () => {
    const groups = {
        a: [1, 2],
        b: [3, 4],
    };

    const accessor = makeCustomGroupAccessor((x) => x, groups);

    expect(accessor(1)).toEqual("a");
    expect(accessor(2)).toEqual("a");
    expect(accessor(3)).toEqual("b");
    expect(accessor(4)).toEqual("b");
});
