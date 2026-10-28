import { beforeAll, describe, expect, test } from "vitest";
import { createGenerator } from "ts-json-schema-generator";
import Ajv from "ajv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const specDir = path.dirname(fileURLToPath(import.meta.url));

describe("generated App schema", () => {
    /** @type {import("ajv").ValidateFunction} */
    let validate;

    beforeAll(() => {
        const schema = createGenerator({
            path: path.join(specDir, "*.d.ts"),
            tsconfig: path.resolve(specDir, "../../../../tsconfig.json"),
            type: "AppRootSpec",
            skipTypeCheck: true,
        }).createSchema("AppRootSpec");
        validate = new Ajv.default({
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);
    });

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
