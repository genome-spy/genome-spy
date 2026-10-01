import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { publicPackages, readJson, releaseVersion } from "./release.mjs";

/**
 * Collect runtime and type entries; development conditions address workspace source.
 * @param {string | Record<string, any>} target
 * @returns {string[]}
 */
function entryPaths(target) {
    return typeof target === "string"
        ? [target.replace(/^\.\//, "")]
        : Object.entries(target)
              .filter(([condition]) => condition !== "development")
              .flatMap(([, value]) => entryPaths(value));
}

/**
 * Check actual archived manifests, including Core's prepack export rewriting.
 * npm pack's JSON lists the files included in each archive.
 * @param {string} cwd
 * @param {string} packedFile
 */
export async function verifyPackedPackages(cwd, packedFile) {
    const packed = await readJson(packedFile);
    const names = new Set(packed.map((pkg) => pkg.name));
    if (
        packed.length !== publicPackages.length ||
        publicPackages.some((name) => !names.has(name))
    ) {
        throw new Error("Pack exactly the four public release packages.");
    }
    const version = await releaseVersion(cwd);
    for (const pkg of packed) {
        const manifest = JSON.parse(
            execFileSync(
                "tar",
                [
                    "-xOf",
                    path.join(path.dirname(packedFile), pkg.filename),
                    "package/package.json",
                ],
                { encoding: "utf8" }
            )
        );
        if (
            manifest.private ||
            manifest.name !== pkg.name ||
            manifest.version !== version
        ) {
            throw new Error(`Unexpected archived identity for ${pkg.name}.`);
        }
        const files = /** @type {string[]} */ (
            pkg.files.map((file) => file.path)
        );
        if (files.includes("package.prepack-backup.json")) {
            throw new Error(`Manifest backup leaked into ${pkg.name}.`);
        }
        const entries = entryPaths(manifest.exports ?? {});
        for (const field of [
            "main",
            "module",
            "types",
            "browser",
            "jsdelivr",
            "unpkg",
        ]) {
            if (manifest[field]) {
                entries.push(...entryPaths(manifest[field]));
            }
        }
        for (const entry of entries) {
            const [prefix, suffix] = entry.split("*");
            const included = entry.includes("*")
                ? files.some(
                      (file) => file.startsWith(prefix) && file.endsWith(suffix)
                  )
                : files.includes(entry);
            if (!included) {
                throw new Error(
                    `${pkg.name} is missing archived entry ${entry}.`
                );
            }
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await verifyPackedPackages(process.cwd(), path.resolve(process.argv[2]));
    process.stdout.write(
        "All four package archives contain their runtime and type entries.\n"
    );
}
