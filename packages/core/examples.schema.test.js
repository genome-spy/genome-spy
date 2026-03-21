import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import Ajv from "ajv";
import { createGenerator } from "ts-json-schema-generator";

import {
    collectSharedExamplePaths,
    loadSharedExampleSpec,
} from "./src/spec/exampleFiles.js";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageRoot, "..", "..");

const validateCoreSpec = createCoreSpecValidator();
const examplePaths = collectSharedExamplePaths();

describe("shared example specs", () => {
    test.each(examplePaths)(
        "validate %s against the core schema",
        (examplePath) => {
            const spec = loadSharedExampleSpec(examplePath);

            expect(
                validateCoreSpec(spec),
                JSON.stringify(validateCoreSpec.errors, null, 2)
            ).toBe(true);
        }
    );
});

function createCoreSpecValidator() {
    const schema = createGenerator({
        path: path.join(packageRoot, "src/spec/*.ts"),
        tsconfig: path.join(repoRoot, "tsconfig.json"),
        type: "CoreRootSpec",
        skipTypeCheck: true,
    }).createSchema("CoreRootSpec");

    return new Ajv.default({
        allErrors: true,
        strict: false,
        allowUnionTypes: true,
    }).compile(schema);
}
