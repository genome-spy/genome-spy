import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
    "generatedActionCatalog.js"
);

const actual = await readFile(outputPath, "utf8");
const expected = await renderGeneratedActionCatalog(
    await createGeneratedActionCatalog()
);

if (actual !== expected) {
    console.error(
        "Generated action catalog is out of date. Run `npm run generate:agent-catalog`."
    );
    process.exitCode = 1;
} else {
    console.log("Generated action catalog is up to date.");
}
