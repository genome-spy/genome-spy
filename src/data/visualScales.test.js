import * as vs from './visualScales';


function wrap(value) {
    return { x: value };
}

function wrapArray(values) {
    return values.map(wrap);
}

/**
 * @typedef {import('./visualScales').FieldEncodingConfig} FieldEncodingConfig
 */
describe("EncodingMapper", () => {
    
    test("Trivial numeric", () => {
        /** @type {FieldEncodingConfig} */
        const encodingConfig = {
            field: "x"
        }

        const map = vs.createFieldEncodingMapper("number", encodingConfig);

        expect(map(wrap(123))).toEqual(123);
    });

    // TODO: Implement domains and ranges for numeric types


    test("Nominal colors with sample data", () => {
        /** @type {FieldEncodingConfig} */
        const encodingConfig = {
            field: "x"
        }

        // When the domain is inferred from sample data, it will be sorted in natural order
        const sampleData = wrapArray(["B", "C", "D", "A", "C"]);

        const map = vs.createFieldEncodingMapper("color", encodingConfig, sampleData);

        expect(wrapArray(["A", "B", "D"]).map(map))
            .toEqual([0, 1, 3].map(x => vs.defaultOrdinalScheme[x]));
    });


    test("Nominal colors with explicit domain and custom scheme", () => {
        const customRange = ["#111", "#222", "#333", "#444"];

        /** @type {FieldEncodingConfig} */
        const encodingConfig = {
            field: "x",
            domain: ["A", "C", "B", "D"],
            range: customRange
        }

        const map = vs.createFieldEncodingMapper("color", encodingConfig);

        expect(wrapArray(["A", "B", "C"]).map(map))
            .toEqual([0, 2, 1].map(x => customRange[x]));
    });

    
    test("Ordinal colors with sample data", () => {
        /** @type {FieldEncodingConfig} */
        const encodingConfig = {
            field: "x"
        }

        const sampleData = wrapArray([4, 5, 3, 1, 2, 3]);

        const map = vs.createFieldEncodingMapper("color", encodingConfig, sampleData);

        expect(wrapArray([1, 3, 5]).map(map))
            .toEqual([0, 0.5, 1].map(vs.defaultSequentialInterpolator));
    })

    test("Ordinal colors with explicit domain", () => {
        /** @type {FieldEncodingConfig} */
        const encodingConfig = {
            field: "x",
            domain: [11, 13]
        }

        const map = vs.createFieldEncodingMapper("color", encodingConfig);

        expect(wrapArray([10, 11, 12, 13, 14]).map(map))
            .toEqual([0, 0, 0.5, 1, 1].map(vs.defaultSequentialInterpolator));
    })
});

