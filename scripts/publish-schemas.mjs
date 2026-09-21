import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
    advancesMajorAlias,
    publishSchema,
    validatePreviousExamples,
} from "./schema-publication.mjs";

const console = globalThis.console;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const siteDir = readSiteDir(process.argv.slice(2));
const examplesDir = path.join(siteDir, "docs", "example-specs");

const releases = await Promise.all(
    ["core", "app"].map(async (library) => ({
        library: /** @type {"core" | "app"} */ (library),
        version: JSON.parse(
            await readFile(
                path.join(repoRoot, "packages", library, "package.json"),
                "utf8"
            )
        ).version,
        schemaPath: path.join(
            repoRoot,
            "packages",
            library,
            "dist",
            "schema.json"
        ),
    }))
);

for (const release of releases) {
    if (!(await advancesMajorAlias({ siteDir, ...release }))) {
        console.log(
            `Skipped previous ${release.library} examples; major alias will not advance`
        );
        continue;
    }

    const result = await validatePreviousExamples({
        examplesDir,
        ...release,
    });
    console.log(
        `Validated ${result.checked} previous ${release.library} examples` +
            (result.skipped ? `; skipped ${result.skipped}` : "")
    );
}

for (const release of releases) {
    await publishSchema({ siteDir, ...release });
    console.log(`Published ${release.library} schema v${release.version}`);
}

/**
 * @param {string[]} args
 */
function readSiteDir(args) {
    if (args.length !== 2 || args[0] !== "--site-dir") {
        throw new Error(
            "Usage: node scripts/publish-schemas.mjs --site-dir <site-checkout>"
        );
    }

    return path.resolve(args[1]);
}
