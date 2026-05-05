import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    renderGeneratedActionTypes,
} from "./generateAgentActionTypes.mjs";
import { createGeneratedActionCatalog } from "./generateAgentActionCatalog.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generated",
    "generatedActionTypes.ts"
);

describe("generateAgentActionTypes", () => {
    it("matches the committed generated action types", async () => {
        const generatedActionTypes = renderGeneratedActionTypes(
            await createGeneratedActionCatalog()
        );
        const actual = await readFile(outputPath, "utf8");

        expect(actual).toBe(generatedActionTypes);
    });
});
