import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const commit = "df1d737e5503c0463a35e94cf0b4d922a076ea91";
const root = fileURLToPath(new URL("../", import.meta.url));
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

if (git(["rev-parse", "HEAD"]) !== commit) {
    throw new Error("Figwig checkout must be at " + commit);
}
if (git(["status", "--porcelain"])) {
    throw new Error("Figwig checkout must have a clean working tree.");
}

const output = path.join(root, "private/figwig");
mkdirSync(output, { recursive: true });
const build = mkdtempSync(path.join(output, "build-"));

try {
    // Archive tracked sources so building never modifies the standalone checkout.
    const archive = path.join(build, "sources.tar");
    execFileSync("git", ["-C", checkout, "archive", "-o", archive, commit]);
    execFileSync("tar", ["-xf", archive, "-C", build]);
    rmSync(archive);
    execFileSync("npm", ["ci"], { cwd: build, stdio: "inherit" });
    execFileSync("npm", ["pack", "--pack-destination", output], {
        cwd: build,
        stdio: "inherit",
    });

    const manifest = JSON.parse(
        readFileSync(path.join(build, "package.json"), "utf8")
    );
    process.stdout.write(
        `Packed ${manifest.name}@${manifest.version} from ${commit}\n`
    );
} finally {
    rmSync(build, { recursive: true });
}

// The committed relative dependency and lockfile point at the ignored tarball.
execFileSync("npm", ["install"], { cwd: root, stdio: "inherit" });
