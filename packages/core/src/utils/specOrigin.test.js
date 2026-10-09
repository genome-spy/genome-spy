import { expect, test } from "vitest";
import { cloneWithSpecOrigin, getSpecLocation } from "./specOrigin.js";

test("clones shared and cyclic objects without losing authored identity", () => {
    /** @type {{expr: string, self?: object}} */
    const declaration = { expr: "missing" };
    declaration.self = declaration;
    const copy = cloneWithSpecOrigin([declaration, declaration]);

    expect(copy[0]).not.toBe(declaration);
    expect(copy[0]).toBe(copy[1]);
    expect(copy[0].self).toBe(copy[0]);
    expect(
        getSpecLocation(
            copy[0],
            (fragment) =>
                fragment === declaration ? "declaration" : undefined,
            ["expr"]
        )
    ).toEqual({ origin: "declaration", path: ["expr"] });
});
