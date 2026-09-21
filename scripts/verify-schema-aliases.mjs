import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { verifyPublishedMajorAlias } from "./schema-publication.mjs";

const console = globalThis.console;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const siteDir = readSiteDir(process.argv.slice(2));

for (const library of ["core", "app"]) {
    const version = JSON.parse(
        await readFile(
            path.join(repoRoot, "packages", library, "package.json"),
            "utf8"
        )
    ).version;

    await verifyPublishedMajorAlias({
        siteDir,
        library: /** @type {"core" | "app"} */ (library),
        version,
    });
    console.log(`Verified published ${library} schema for v${version}`);
}

/**
 * @param {string[]} args
 */
function readSiteDir(args) {
    if (args.length !== 2 || args[0] !== "--site-dir") {
        throw new Error(
            "Usage: node scripts/verify-schema-aliases.mjs --site-dir <site-checkout>"
        );
    }

    return path.resolve(args[1]);
}
