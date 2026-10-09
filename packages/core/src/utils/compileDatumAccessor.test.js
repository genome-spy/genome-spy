import { expect, test } from "vitest";
import compileDatumAccessor from "./compileDatumAccessor.js";

test("isolates identical compilations for unrelated data sources", () => {
    const first = compileDatumAccessor("return datum.x;", ["x"]);
    const second = compileDatumAccessor("return datum.x;", ["x"]);

    // Identical generated source can share V8 feedback despite separate closures.
    expect(first.toString()).not.toBe(second.toString());
    expect(first()({ x: 1 })).toBe(1);
    expect(second()({ padding: 0, x: 2 })).toBe(2);
});
