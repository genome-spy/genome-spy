import { expect, test } from "vitest";
import { createDiscreteLegendEntries } from "./legendEntries.js";

test("createDiscreteLegendEntries uses resolved scale domain order", () => {
    const resolution = /** @type {any} */ ({
        getDomain: () => ["Europe", "Japan", "USA"],
    });

    expect(createDiscreteLegendEntries(resolution)).toEqual([
        { value: "Europe", label: "Europe", _legendIndex: 0 },
        { value: "Japan", label: "Japan", _legendIndex: 1 },
        { value: "USA", label: "USA", _legendIndex: 2 },
    ]);
});

test("createDiscreteLegendEntries stringifies primitive labels", () => {
    const resolution = /** @type {any} */ ({
        getDomain: () => [1, true, "A"],
    });

    expect(createDiscreteLegendEntries(resolution)).toEqual([
        { value: 1, label: "1", _legendIndex: 0 },
        { value: true, label: "true", _legendIndex: 1 },
        { value: "A", label: "A", _legendIndex: 2 },
    ]);
});
