import { describe, expect, test } from "vitest";
import { createGenerator } from "ts-json-schema-generator";
import Ajv from "ajv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const specDir = path.dirname(fileURLToPath(import.meta.url));

describe("generated App schema", () => {
    test("accepts Figwig metadata and requires a file URL", () => {
        const schema = createGenerator({
            path: path.join(specDir, "*.d.ts"),
            tsconfig: path.resolve(specDir, "../../../../tsconfig.json"),
            type: "AppRootSpec",
            skipTypeCheck: true,
        }).createSchema("AppRootSpec");
        const validate = new Ajv.default({
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);
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
});
