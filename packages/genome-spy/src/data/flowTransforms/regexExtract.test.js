import { processData } from "../flowTestUtils";

import RegexExtractTransform from "./regexExtract";

/**
 *
 * @param {import("./regexExtract").RegexExtractConfig} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new RegexExtractTransform(params), data);
}

describe("RegexExtractTransform", () => {
    const rows = [{ a: "12-34" }, { a: "23-45" }];

    /** @type {import("./regexExtract").RegexExtractConfig} */
    const params = {
        type: "regexExtract",
        regex: "^(\\d+)-(\\d+)$",
        field: "a",
        as: ["b", "c"]
    };

    test("Valid config and input", () => {
        expect(transform(params, rows)).toEqual([
            { a: "12-34", b: "12", c: "34" },
            { a: "23-45", b: "23", c: "45" }
        ]);
    });

    test("Invalid config", () => {
        /** @type {import("./regexExtract").RegexExtractConfig} */
        const config2 = {
            type: "regexExtract",
            regex: "^(\\d+)-(\\d+)$",
            field: "a",
            as: ["b", "c", "d"]
        };

        expect(() => transform(config2, rows)).toThrow();
    });

    test("Invalid data", () => {
        const rows2 = [{ a: "12--34" }];

        expect(() => transform(params, rows2)).toThrow();
    });

    test("Invalid, non-string data", () => {
        const rows2 = [{ a: 123 }];

        expect(() => transform(params, rows2)).toThrow();
    });

    test("Skip invalid or non-string data", () => {
        const rows2 = [{ a: 123 }, { a: "xyzzy" }, { a: "12-34" }];

        expect(
            transform({ ...params, skipInvalidInput: true }, rows2)
        ).toEqual([
            { a: 123 },
            { a: "xyzzy" },
            { a: "12-34", b: "12", c: "34" }
        ]);
    });
});
