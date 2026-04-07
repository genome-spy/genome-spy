import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderGeneratedActionTypes } from "./generateAgentActionTypes.mjs";
import { createGeneratedActionCatalog } from "./generateAgentActionCatalog.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generatedActionTypes.ts"
);

const actual = await readFile(outputPath, "utf8");
const expected = renderGeneratedActionTypes(await createGeneratedActionCatalog());

if (actual !== expected) {
    console.error(
        "Generated action types are out of date. Run `npm run generate:agent-action-types`."
    );
    process.exitCode = 1;
} else {
    console.log("Generated action types are up to date.");
}
