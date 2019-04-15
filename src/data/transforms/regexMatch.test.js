import regexMatchTransform from './regexMatch';

describe("RegexMatchTransform", () => {
    const rows = [
        { a: "12-34" },
        { a: "23-45" },
    ];

    const config = {
        regex: "^(\\d+)-(\\d+)$",
        field: "a",
        as: ["b", "c"]
    };

    test("Valid config and input", () => {
        expect(regexMatchTransform(config, rows)).toEqual([
            { a: "12-34", b: "12", c: "34" },
            { a: "23-45", b: "23", c: "45" },
        ]);

    });

    test("Invalid config", () => {
        const config2 = {
            regex: "^(\\d+)-(\\d+)$",
            field: "a",
            as: ["b", "c", "d"]
        };

        expect(() => regexMatchTransform(config2, rows)).toThrow();
    });

    test("Invalid data", () => {
        const rows2 = [
            { a: "12--34" }
        ];

        expect(() => regexMatchTransform(config, rows2)).toThrow();
    });

    test("Invalid, non-string data", () => {
        const rows2 = [
            { a: 123 }
        ]

        expect(() => regexMatchTransform(config, rows2)).toThrow();
    });

    test("Skip invalid or non-string data", () => {
        const rows2 = [
            { a: 123 },
            { a: "xyzzy" },
            { a: "12-34" }
        ];

        expect(regexMatchTransform({ ...config, skipInvalidInput: true }, rows2))
            .toEqual([
                { a: 123 },
                { a: "xyzzy" },
                { a: "12-34", b: "12", c: "34" }
            ]);
    });

});