import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { createGenerator } from "ts-json-schema-generator";
import Ajv from "ajv";

const specDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(specDir, "..", "..");
const repoRoot = path.resolve(packageDir, "..", "..");

function createCoreSchema() {
    return createGenerator({
        path: path.join(packageDir, "src/spec/*.ts"),
        tsconfig: path.join(repoRoot, "tsconfig.json"),
        type: "CoreRootSpec",
        skipTypeCheck: true,
    }).createSchema("CoreRootSpec");
}

describe("generated core schema", () => {
    test("accepts conditional mark-property branches with their own scale", () => {
        const schema = createCoreSchema();
        const spec = JSON.parse(
            fs.readFileSync(
                path.join(
                    repoRoot,
                    "examples/docs/grammar/parameters/penguins.json"
                ),
                "utf8"
            )
        );

        // Non-obvious: this example exercises a conditional field branch inside
        // a value fallback, which must keep its own nested scale in schema output.
        const validate = new Ajv.default({
            allErrors: true,
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);

        expect(validate(spec), JSON.stringify(validate.errors, null, 2)).toBe(
            true
        );
    });
});
