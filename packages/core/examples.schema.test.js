import { describe, expect, test } from "vitest";
import Ajv from "ajv";
import { generateSpecSchema } from "../../scripts/generateSpecSchema.mjs";

import {
    collectSharedExamplePaths,
    loadSharedExampleSpec,
} from "./src/spec/exampleFiles.js";

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
    const schema = generateSpecSchema("core", { skipTypeCheck: true });

    return new Ajv.default({
        allErrors: true,
        strict: false,
        allowUnionTypes: true,
    }).compile(schema);
}
