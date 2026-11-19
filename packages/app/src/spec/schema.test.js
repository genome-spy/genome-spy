import { beforeAll, describe, expect, test } from "vitest";
import { generateSpecSchema } from "../../../../scripts/generateSpecSchema.mjs";
import Ajv from "ajv";

describe("generated App schema", () => {
    /** @type {import("ajv").ValidateFunction} */
    let validate;

    beforeAll(() => {
        const schema = generateSpecSchema("app", { skipTypeCheck: true });
        validate = new Ajv.default({
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);
    }, 30000);

    test("accepts Figwig metadata and requires a file URL", () => {
        const backend = {
            backend: "figwig",
            url: "signals.fw",
        };
        const spec = {
            samples: {
                identity: { data: { values: [{ sample: "001" }] } },
            },
            metadata: {
                sources: [{ backend, initialLoad: "*" }],
            },
            spec: { mark: "point" },
        };

        expect(validate(spec), JSON.stringify(validate.errors)).toBe(true);
        expect(
            validate({
                ...spec,
                metadata: {
                    sources: [
                        { backend: { ...backend, parse: { age: "number" } } },
                    ],
                },
            })
        ).toBe(false);
        expect(
            validate({
                ...spec,
                metadata: { sources: [{ backend: { backend: "figwig" } }] },
            })
        ).toBe(false);
    });

    test("accepts metadata identity and keeps its schema separate from explicit data", () => {
        const validIdentities = [
            "metadata",
            { metadataSource: "signals" },
            { metadataSource: "signals", displayNameField: "rowLabel" },
            { data: { values: [{ sample: "001" }] } },
        ];
        const invalidIdentities = [
            "signals",
            { metadataSource: "" },
            { displayNameField: "rowLabel" },
            { metadataSource: "signals", idField: "name" },
            { metadataSource: "signals", data: { values: [] } },
        ];
        const cases = [
            ...validIdentities.map((identity) => ({
                identity,
                expected: true,
            })),
            ...invalidIdentities.map((identity) => ({
                identity,
                expected: false,
            })),
        ];
        for (const { identity, expected } of cases) {
            const spec = {
                samples: { identity },
                metadata: {
                    sources: [
                        {
                            id: "signals",
                            backend: {
                                backend: "figwig",
                                url: "signals.fw",
                            },
                        },
                    ],
                },
                spec: { mark: "point" },
            };
            expect(validate(spec), JSON.stringify(identity)).toBe(expected);
        }
    });
});
