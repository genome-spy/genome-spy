#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { extname, relative } from "node:path";
import parser from "@typescript-eslint/parser";

const args = parseArgs(process.argv.slice(2));
const base = args.base ?? defaultBase();
const comparisonBase = git("merge-base", base, "HEAD");
const scope = args.path ?? ".";
const extensions = new Set(
    (args.extensions ?? ".js")
        .split(",")
        .map((extension) => (extension.startsWith(".") ? extension : `.${extension}`))
);

const changedPaths = gitRaw(
    "diff",
    "--no-renames",
    "-z",
    "--name-only",
    `${base}...HEAD`,
    "--",
    scope
)
    .split("\0")
    .filter(Boolean)
    .filter(
        (path) => {
            const isDeclaration = path.endsWith(".d.ts");
            return (
                (!isDeclaration || args.includeDeclarations) &&
                (extensions.has(extname(path)) ||
                    (args.includeDeclarations && isDeclaration))
            );
        }
    )
    .filter((path) => args.includeTests || !isTestPath(path));

const fileCounts = changedPaths.map((path) => ({
    path,
    counts: countChangedLines(path, base),
}));

const totals = fileCounts.reduce(
    (result, { counts }) => {
        result.before += counts.before;
        result.after += counts.after;
        result.added += counts.added;
        result.deleted += counts.deleted;
        return result;
    },
    { before: 0, after: 0, added: 0, deleted: 0 }
);

console.log(`Base ref: ${base} (${git("rev-parse", base)})`);
console.log(`Diff base: ${comparisonBase}`);
console.log(`Scope: ${scope}`);
console.log(`Extensions: ${[...extensions].join(", ")}`);
console.log(`Tests: ${args.includeTests ? "included" : "excluded"}`);
console.log(`Declarations: ${args.includeDeclarations ? "included" : "excluded"}`);
console.log(`Files: ${changedPaths.length}`);
console.log(`Non-comment code lines before: ${totals.before}`);
console.log(`Non-comment code lines after: ${totals.after}`);
console.log(`Added: ${totals.added}`);
console.log(`Deleted: ${totals.deleted}`);
console.log(`Net: ${totals.added - totals.deleted}`);

if (args.files) {
    for (const { path, counts } of fileCounts) {
        console.log(
            `${relative(process.cwd(), path)}\tbefore=${counts.before}` +
                `\tafter=${counts.after}\tadded=${counts.added}` +
                `\tdeleted=${counts.deleted}\tnet=${counts.added - counts.deleted}`
        );
    }
}

function parseArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") printHelp();
        else if (arg === "--include-tests") result.includeTests = true;
        else if (arg === "--include-declarations") result.includeDeclarations = true;
        else if (arg === "--files") result.files = true;
        else if (arg.startsWith("--base=")) result.base = requiredValue(arg, arg.slice(7));
        else if (arg === "--base") result.base = nextValue(argv, ++index, arg);
        else if (arg.startsWith("--path=")) result.path = requiredValue(arg, arg.slice(7));
        else if (arg === "--path") result.path = nextValue(argv, ++index, arg);
        else if (arg.startsWith("--extensions=")) {
            result.extensions = requiredValue(arg, arg.slice(13));
        } else if (arg === "--extensions") {
            result.extensions = nextValue(argv, ++index, arg);
        }
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return result;
}

function nextValue(argv, index, option) {
    return requiredValue(option, argv[index]);
}

function requiredValue(option, value) {
    if (!value || value.startsWith("--")) {
        throw new Error(`${option} requires a value`);
    }
    return value;
}

function printHelp() {
    console.log(`Usage: node scripts/count-production-lines.mjs [options]

Options:
  --base REF          Comparison base, defaulting to origin/master or master
  --path PATH         Scope the Git diff, defaulting to the repository root
  --extensions LIST   Comma-separated extensions, defaulting to .js
  --include-tests     Include conventional test files and test directories
  --include-declarations  Include .d.ts files
  --files             Print before/after and added/deleted/net counts per file
  -h, --help          Show this help`);
    process.exit(0);
}

function defaultBase() {
    const hasOriginMaster =
        spawnSync("git", ["show-ref", "--verify", "--quiet", "refs/remotes/origin/master"]).status ===
        0;
    return hasOriginMaster ? "origin/master" : "master";
}

function git(...command) {
    return gitRaw(...command).trim();
}

function gitRaw(...command) {
    return execFileSync("git", command, { encoding: "utf8" });
}

function countChangedLines(path, baseRef) {
    const beforeText = gitContent(comparisonBase, path);
    const afterText = gitContent("HEAD", path);
    const beforeLines = codeLineSet(beforeText, path);
    const afterLines = codeLineSet(afterText, path);
    const diff = git("diff", "--no-renames", "--unified=0", `${baseRef}...HEAD`, "--", path);
    let oldLine = 0;
    let newLine = 0;
    let added = 0;
    let deleted = 0;

    for (const row of diff.split("\n")) {
        const header = row.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (header) {
            oldLine = Number(header[1]);
            newLine = Number(header[3]);
            continue;
        }
        if (
            row.startsWith("+++") ||
            row.startsWith("---") ||
            row.startsWith("\\ No newline") ||
            row === ""
        ) {
            continue;
        }

        if (row.startsWith("+")) {
            if (afterLines.has(newLine)) added++;
            newLine++;
        } else if (row.startsWith("-")) {
            if (beforeLines.has(oldLine)) deleted++;
            oldLine++;
        } else {
            oldLine++;
            newLine++;
        }
    }

    return {
        before: beforeLines.size,
        after: afterLines.size,
        added,
        deleted,
    };
}

function gitContent(ref, path) {
    const exists = spawnSync("git", ["cat-file", "-e", `${ref}:${path}`]).status === 0;
    return exists
        ? execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" })
        : "";
}

function isTestPath(path) {
    return (
        /\.(?:test|spec)\.[^.]+$/.test(path) ||
        path.split("/").some((segment) =>
            ["test", "tests", "__tests__"].includes(segment)
        )
    );
}

function codeLineSet(text, path) {
    const lines = new Set();
    if (!text) return lines;

    let syntaxTree;
    try {
        syntaxTree = parser.parse(text, {
            comment: true,
            filePath: path,
            loc: true,
            range: true,
            sourceType: "module",
            tokens: true,
        });
    } catch (error) {
        throw new Error(
            `Cannot parse ${path}; use a JavaScript or TypeScript extension: ${error.message}`
        );
    }
    for (const token of syntaxTree.tokens) {
        for (let line = token.loc.start.line; line <= token.loc.end.line; line++) {
            lines.add(line);
        }
    }

    return lines;
}
