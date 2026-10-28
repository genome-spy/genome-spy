import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const commit = "df1d737e5503c0463a35e94cf0b4d922a076ea91";
const root = fileURLToPath(new URL("../", import.meta.url));
const patchPath = "scripts/figwig-experiment.patch";
const patch = path.join(root, patchPath);
const checkout = process.argv[2];

if (!checkout || process.argv.length !== 3) {
    throw new Error(
        "Usage: node scripts/setupFigwigExperiment.mjs /path/to/figwig-js"
    );
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
    return execFileSync("git", ["-C", checkout, ...args], {
        encoding: "utf8",
    }).trim();
}

git(["cat-file", "-e", commit + "^{commit}"]);

const output = path.join(root, "private/figwig");
mkdirSync(output, { recursive: true });
const build = mkdtempSync(path.join(os.tmpdir(), "genomespy-figwig-"));

/** @type {string} */
let tarball;

try {
    // The pinned archive and reviewed patch are authoritative; local edits stay untouched.
    const archive = path.join(build, "sources.tar");
    execFileSync("git", ["-C", checkout, "archive", "-o", archive, commit]);
    execFileSync("tar", ["-xf", archive, "-C", build]);
    rmSync(archive);
    const applyOptions = {
        cwd: build,
        env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(build) },
    };
    execFileSync("git", ["apply", "--check", patch], applyOptions);
    execFileSync("git", ["apply", patch], applyOptions);
    execFileSync("npm", ["ci"], { cwd: build, stdio: "inherit" });
    execFileSync("npm", ["pack", "--pack-destination", output], {
        cwd: build,
        stdio: "inherit",
    });

    const manifest = JSON.parse(
        readFileSync(path.join(build, "package.json"), "utf8")
    );
    tarball = path.join(
        output,
        `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`
    );
    const tarballBytes = readFileSync(tarball);
    writeFileSync(
        path.join(output, "provenance.json"),
        JSON.stringify(
            {
                repository: "https://github.com/genome-spy/figwig-js",
                baseCommit: commit,
                patch: {
                    path: patchPath,
                    sha256: createHash("sha256")
                        .update(readFileSync(patch))
                        .digest("hex"),
                },
                tarball: {
                    path: path.relative(root, tarball),
                    integrity:
                        "sha512-" +
                        createHash("sha512")
                            .update(tarballBytes)
                            .digest("base64"),
                },
            },
            null,
            2
        ) + "\n"
    );
    process.stdout.write(
        `Packed ${manifest.name}@${manifest.version} from ${commit} with ${patchPath}\n`
    );
} finally {
    rmSync(build, { recursive: true });
}

// An explicit tarball request refreshes the lock integrity when its filename is unchanged.
execFileSync("npm", ["install", "--workspace", "@genome-spy/core", tarball], {
    cwd: root,
    stdio: "inherit",
});
process.stdout.write(
    "Restart running Vite servers to refresh the reader dependency cache.\n"
);
