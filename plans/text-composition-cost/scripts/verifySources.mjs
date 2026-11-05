/* global fetch */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const revisions = {
    baseline: "8e3d66cf6d35dc5b5073a56bd8137f8479a1bf9d",
    candidate: "aff20e18445a9e6794a2291011e6c0f269f7f64e",
};

/** @param {string | undefined} root */
export function verifySources(root) {
    if (!root)
        throw new Error(
            "Pass a directory containing baseline/ and candidate/ checkouts."
        );
    root = resolve(root);
    for (const [kind, revision] of Object.entries(revisions)) {
        const cwd = resolve(root, kind);
        const head = execFileSync("git", ["rev-parse", "HEAD"], {
            cwd,
            encoding: "utf8",
        }).trim();
        if (head !== revision)
            throw new Error(
                `${kind} must be at ${revision}, received ${head}.`
            );
        execFileSync(
            "git",
            [
                "diff",
                "--exit-code",
                revision,
                "--",
                "packages/webgpu-renderer/src",
            ],
            { cwd }
        );
    }
    return root;
}

/** @param {string} root @param {import("node:child_process").ChildProcess[]} children */
export async function verifyServers(root, children) {
    for (const [kind, port] of [
        ["baseline", 4791],
        ["candidate", 4792],
    ]) {
        const path =
            "packages/webgpu-renderer/src/marks/programs/textProgram.js";
        const expected = readFileSync(
            resolve(root, String(kind), path),
            "utf8"
        );
        const actual = await fetch(
            `http://127.0.0.1:${port}/src/marks/programs/textProgram.js`
        ).then((r) => r.text());
        if (actual !== expected)
            throw new Error(`Wrong source served for ${kind}.`);
    }
    if (children.some((child) => child.exitCode !== null))
        throw new Error(
            "A proof server exited. Ensure ports 4791/4792 are free."
        );
}
