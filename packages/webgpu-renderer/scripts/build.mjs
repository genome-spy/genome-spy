/* global console */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

function run(command, args, { print = true } = {}) {
    const result = spawnSync(command, args, {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["inherit", "pipe", "pipe"],
    });
    if (print && result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (print && result.stderr) {
        process.stderr.write(result.stderr);
    }
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(" ")} failed.`);
    }
    return result.stdout;
}

run("npm", ["run", "test:tsc"]);
run("npm", ["run", "test:bundle"]);
run("npm", ["run", "lint"]);

const packJson = run(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { print: false }
);
const pack = JSON.parse(packJson.trim())[0];
const files = pack.files.map(({ path: filePath }) => filePath);
const forbidden = [
    /(^|\/)tests?\//,
    /(^|\/)test-results\//,
    /(^|\/)testUtils\//,
    /\.test\.js$/,
    /(^|\/)plans\//,
    /MIGRATION_PLAN\.md$/,
];
for (const filePath of files) {
    if (forbidden.some((pattern) => pattern.test(filePath))) {
        throw new Error(`Development artifact was packed: ${filePath}`);
    }
}
if (!files.includes("src/fonts/OFL.txt")) {
    throw new Error("The exported font license is missing from the package.");
}

console.log(
    `Package contents verified: ${files.length} files, ${pack.size} bytes.`
);
