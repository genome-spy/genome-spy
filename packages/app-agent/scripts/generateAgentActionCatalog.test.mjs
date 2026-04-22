import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    createGeneratedActionCatalog,
    renderGeneratedActionCatalog,
} from "./generateAgentActionCatalog.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generated",
    "generatedActionCatalog.json"
);

describe("generateAgentActionCatalog", () => {
    it("matches the committed generated catalog", async () => {
        const generatedActionCatalog = await createGeneratedActionCatalog();
        const expected = await renderGeneratedActionCatalog(
            generatedActionCatalog
        );
        const actual = await readFile(outputPath, "utf8");

        expect(actual).toBe(expected);
    });
});
