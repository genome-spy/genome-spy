import flattenDelimitedTransform from './flattenDelimited';

const sampleData = [
    { id: 1, a: "q, w, e", b: "a-s-d" },
    { id: 2, a: "r, t, y", b: "f-g-h" },
    { id: 3, a: "u", b: "j" }
]


describe("FlattenDelimited transform", () => {

    test("With a single field", () => {
        /** @type {import("./flattenDelimited").FlattenDelimitedConfig} */
        const config = {
            type: "flattenDelimited",
            field: "a",
            separator: ", "
        };

        expect(flattenDelimitedTransform(config, sampleData)).toEqual([
            { id: 1, a: "q", b: "a-s-d" },
            { id: 1, a: "w", b: "a-s-d" },
            { id: 1, a: "e", b: "a-s-d" },
            { id: 2, a: "r", b: "f-g-h" },
            { id: 2, a: "t", b: "f-g-h" },
            { id: 2, a: "y", b: "f-g-h" },
            { id: 3, a: "u", b: "j" }
        ]);
    });

    test("With two fields", () => {
        /** @type {import("./flattenDelimited").FlattenDelimitedConfig} */
        const config = {
            type: "flattenDelimited",
            field: ["a", "b"],
            as: ["a", "c"],
            separator: [", ", "-"]
        };

        expect(flattenDelimitedTransform(config, sampleData)).toEqual([
            { id: 1, a: "q", b: "a-s-d", c: "a" },
            { id: 1, a: "w", b: "a-s-d", c: "s" },
            { id: 1, a: "e", b: "a-s-d", c: "d" },
            { id: 2, a: "r", b: "f-g-h", c: "f" },
            { id: 2, a: "t", b: "f-g-h", c: "g" },
            { id: 2, a: "y", b: "f-g-h", c: "h" },
            { id: 3, a: "u", b: "j", c: "j" }
        ]);
    });

    test("Throws on differing field lengths", () => {
        const data = [{
            a: "1-2", b: "1-2-3"
        }];

        /** @type {import("./flattenDelimited").FlattenDelimitedConfig} */
        const config = {
            type: "flattenDelimited",
            field: ["a", "b"],
            separator: ["-", "-"]
        };

        expect(() => flattenDelimitedTransform(config, data)).toThrow();
    });

    test("Throws on mismatching spec lengths", () => {
        /** @type {import("./flattenDelimited").FlattenDelimitedConfig} */
        const config = {
            type: "flattenDelimited",
            field: ["a", "b"],
            separator: ["a"],
        };

        expect(() => flattenDelimitedTransform(config, sampleData)).toThrow();
    });
})