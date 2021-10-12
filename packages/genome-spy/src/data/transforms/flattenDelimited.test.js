import { processData } from "../flowTestUtils";
import FlattenDelimitedTransform from "./flattenDelimited";

const sampleData = [
    { id: 1, a: "q, w, e", b: "a-s-d" },
    { id: 2, a: "r, t, y", b: "f-g-h" },
    { id: 3, a: "u", b: "j" },
];

/**
 * @param {import("./flattenDelimited").FlattenDelimitedParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new FlattenDelimitedTransform(params), data);
}

describe("FlattenDelimited transform", () => {
    test("With a single field", () => {
        /** @type {import("./flattenDelimited").FlattenDelimitedParams} */
        const config = {
            type: "flattenDelimited",
            field: "a",
            separator: ", ",
        };

        expect(transform(config, sampleData)).toEqual([
            { id: 1, a: "q", b: "a-s-d" },
            { id: 1, a: "w", b: "a-s-d" },
            { id: 1, a: "e", b: "a-s-d" },
            { id: 2, a: "r", b: "f-g-h" },
            { id: 2, a: "t", b: "f-g-h" },
            { id: 2, a: "y", b: "f-g-h" },
            { id: 3, a: "u", b: "j" },
        ]);
    });

    test("With two fields", () => {
        /** @type {import("./flattenDelimited").FlattenDelimitedParams} */
        const config = {
            type: "flattenDelimited",
            field: ["a", "b"],
            as: ["a", "c"],
            separator: [", ", "-"],
        };

        expect(transform(config, sampleData)).toEqual([
            { id: 1, a: "q", b: "a-s-d", c: "a" },
            { id: 1, a: "w", b: "a-s-d", c: "s" },
            { id: 1, a: "e", b: "a-s-d", c: "d" },
            { id: 2, a: "r", b: "f-g-h", c: "f" },
            { id: 2, a: "t", b: "f-g-h", c: "g" },
            { id: 2, a: "y", b: "f-g-h", c: "h" },
            { id: 3, a: "u", b: "j", c: "j" },
        ]);
    });

    test("Throws on differing field lengths", () => {
        const data = [
            {
                a: "1-2",
                b: "1-2-3",
            },
        ];

        /** @type {import("./flattenDelimited").FlattenDelimitedParams} */
        const config = {
            type: "flattenDelimited",
            field: ["a", "b"],
            separator: ["-", "-"],
        };

        expect(() => transform(config, data)).toThrow();
    });

    test("Throws on mismatching spec lengths", () => {
        /** @type {import("./flattenDelimited").FlattenDelimitedParams} */
        const config = {
            type: "flattenDelimited",
            field: ["a", "b"],
            separator: ["a"],
        };

        expect(() => transform(config, sampleData)).toThrow();
    });
});
