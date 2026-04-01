import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    createGeneratedActionSummaries,
    renderGeneratedActionSummaries,
} from "./generateAgentActionSummaries.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generatedActionSummaries.js"
);

const actual = await readFile(outputPath, "utf8");
const expected = await renderGeneratedActionSummaries(
    await createGeneratedActionSummaries()
);

if (actual !== expected) {
    console.error(
        "Generated action summaries are out of date. Run `npm run generate:agent-action-summaries`."
    );
    process.exitCode = 1;
} else {
    console.log("Generated action summaries are up to date.");
}
