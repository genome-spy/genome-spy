import process from "node:process";
import { fileURLToPath } from "node:url";
import { readReleasePlan } from "./release.mjs";

/**
 * Validate existing fragments and release policy without requiring a new note.
 * @param {string} cwd
 */
export async function checkChangesets(cwd) {
    await readReleasePlan(cwd);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await checkChangesets(process.cwd());
    process.stdout.write("Changesets and release package policy are valid.\n");
}
