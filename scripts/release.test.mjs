import { execFileSync } from "node:child_process";
import {
    mkdtemp,
    mkdir,
    readFile,
    readdir,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { checkChangesets } from "./checkChangesets.mjs";
import {
    prepareRelease,
    readJson,
    readReleasePlan,
    releaseNotes,
} from "./release.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
/** @type {string[]} */
const fixtures = [];

afterEach(async () => {
    await Promise.all(
        fixtures
            .splice(0)
            .map((cwd) => rm(cwd, { recursive: true, force: true }))
    );
});

/** @param {string} filename @param {unknown} value */
async function writeJson(filename, value) {
    await writeFile(filename, JSON.stringify(value, null, 2) + "\n");
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** @param {string} cwd */
function commit(cwd) {
    git(cwd, ["add", "."]);
    git(cwd, ["commit", "--quiet", "-m", "chore: fixture"]);
}

/** Build a real workspace and Git history, with no network or publish scripts. */
async function fixture() {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "genomespy-release-"));
    fixtures.push(cwd);
    await mkdir(path.join(cwd, ".changeset"));
    const config = await readJson(
        path.join(repoRoot, ".changeset/config.json")
    );
    // Use the offline formatter while exercising real Changesets versioning.
    config.changelog = ["@changesets/cli/changelog", null];
    config.format = false;
    await writeJson(path.join(cwd, ".changeset/config.json"), config);
    await writeJson(path.join(cwd, "package.json"), {
        name: "release-fixture",
        private: true,
        workspaces: ["packages/*"],
    });
    await writeJson(path.join(cwd, "lerna.json"), { version: "1.0.0" });
    await writeFile(
        path.join(cwd, "CHANGELOG.md"),
        "# Change Log\n\n# [1.0.0](https://example.org/v1.0.0)\n\nExisting history.\n"
    );
    await writeFile(path.join(cwd, ".gitignore"), "node_modules/\n");
    await writeFile(path.join(cwd, ".npmrc"), "offline=true\n");
    await symlink(
        path.join(repoRoot, "node_modules"),
        path.join(cwd, "node_modules")
    );

    const directories = await readdir(path.join(repoRoot, "packages"), {
        withFileTypes: true,
    });
    for (const directory of directories
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)) {
        const actual = await readJson(
            path.join(repoRoot, "packages", directory, "package.json")
        );
        const manifest = {
            name: actual.name,
            version: "1.0.0",
            private: !!actual.private,
        };
        for (const field of [
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "optionalDependencies",
        ]) {
            const internal = Object.entries(actual[field] ?? {}).filter(
                ([name]) => name.startsWith("@genome-spy/")
            );
            if (internal.length) {
                manifest[field] = Object.fromEntries(internal);
            }
        }
        await mkdir(path.join(cwd, "packages", directory), { recursive: true });
        await writeJson(
            path.join(cwd, "packages", directory, "package.json"),
            manifest
        );
    }

    execFileSync(
        "npm",
        [
            "install",
            "--package-lock-only",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
        ],
        { cwd, stdio: "pipe" }
    );
    git(cwd, ["init", "--quiet", "--initial-branch=master"]);
    git(cwd, ["config", "user.name", "Release fixture"]);
    git(cwd, ["config", "user.email", "release@example.org"]);
    git(cwd, ["config", "commit.gpgsign", "false"]);
    commit(cwd);
    git(cwd, ["tag", "v1.0.0"]);
    return cwd;
}

/** @param {string} cwd @param {string} contents */
async function addChangeset(cwd, contents) {
    await writeFile(path.join(cwd, ".changeset/change.md"), contents);
    commit(cwd);
}

describe("fixed post-1.0 releases", () => {
    test.each([
        ["@genome-spy/core", "patch", "1.0.1"],
        ["@genome-spy/core", "minor", "1.1.0"],
        ["@genome-spy/core", "major", "2.0.0"],
        ["@genome-spy/app-agent", "minor", "1.1.0"],
    ])(
        "prepares %s %s through the real version command",
        async (name, type, version) => {
            const cwd = await fixture();
            await addChangeset(
                cwd,
                `---\n"${name}": ${type}\n---\n\nKeep axis labels consistent.\n`
            );
            const baseline = git(cwd, ["rev-parse", "HEAD"]);
            const plan = await readReleasePlan(cwd);
            expect(plan.releases).toHaveLength(8);
            expect(
                new Set(plan.releases.map((release) => release.newVersion))
            ).toEqual(new Set([version]));

            await prepareRelease(cwd);

            expect((await readJson(path.join(cwd, "lerna.json"))).version).toBe(
                version
            );
            const lock = await readJson(path.join(cwd, "package-lock.json"));
            for (const directory of await readdir(path.join(cwd, "packages"))) {
                const manifest = await readJson(
                    path.join(cwd, "packages", directory, "package.json")
                );
                const expected =
                    directory === "webgpu-renderer" ? "1.0.0" : version;
                expect(manifest.version).toBe(expected);
                expect(lock.packages[`packages/${directory}`].version).toBe(
                    expected
                );
            }
            const core = await readJson(
                path.join(cwd, "packages/core/package.json")
            );
            expect(core.devDependencies["@genome-spy/webgpu-renderer"]).toBe(
                "^1.0.0"
            );
            const app = await readJson(
                path.join(cwd, "packages/app/package.json")
            );
            expect(app.dependencies["@genome-spy/core"]).toBe(`^${version}`);
            expect(await readdir(path.join(cwd, ".changeset"))).toEqual([
                "config.json",
            ]);
            expect(await releaseNotes(cwd)).toContain(
                "Keep axis labels consistent."
            );
            expect(
                await readFile(path.join(cwd, "CHANGELOG.md"), "utf8")
            ).toContain("Existing history.");
            expect(git(cwd, ["rev-parse", "HEAD"])).toBe(baseline);
            expect(git(cwd, ["tag"])).toBe("v1.0.0");
            await expect(
                checkChangesets(cwd, baseline)
            ).resolves.toBeUndefined();
            commit(cwd);
            await expect(
                checkChangesets(cwd, "v1.0.0")
            ).resolves.toBeUndefined();
        }
    );

    test("versions private applications and aggregates a multi-package note once", async () => {
        const cwd = await fixture();
        await addChangeset(
            cwd,
            '---\n"@genome-spy/app-agent": minor\n"@genome-spy/core": major\n---\n\nReplace the old API.\n\nMigration: rename oldProperty to newProperty.\n'
        );
        await writeFile(
            path.join(cwd, ".changeset/fix.md"),
            '---\n"@genome-spy/app": patch\n---\n\nPreserve sample order.\n'
        );
        commit(cwd);
        await prepareRelease(cwd);

        const agent = await readJson(
            path.join(cwd, "packages/app-agent/package.json")
        );
        expect(agent.version).toBe("2.0.0");
        expect(agent.private).toBe(true);
        const notes = await releaseNotes(cwd);
        expect(notes.match(/Replace the old API\./g)).toHaveLength(1);
        expect(notes).toContain("### Breaking changes");
        expect(notes).toContain(
            "Migration: rename oldProperty to newProperty."
        );
        expect(notes).not.toContain("### New features");
        expect(notes).toContain("### Fixes");
        expect(notes).toContain("Preserve sample order.");

        // Pack the publication candidates locally and rehearse the single tag.
        commit(cwd);
        const artifacts = path.join(cwd, "artifacts");
        await mkdir(artifacts);
        const packed = [];
        for (const directory of await readdir(path.join(cwd, "packages"))) {
            const packageDir = path.join(cwd, "packages", directory);
            const manifest = await readJson(
                path.join(packageDir, "package.json")
            );
            if (!manifest.private) {
                const result = JSON.parse(
                    execFileSync(
                        "npm",
                        [
                            "pack",
                            packageDir,
                            "--ignore-scripts",
                            "--json",
                            "--offline",
                            "--cache",
                            path.join(artifacts, "cache"),
                        ],
                        { cwd: artifacts, encoding: "utf8" }
                    )
                );
                packed.push(result[0].name);
                expect(result[0].version).toBe("2.0.0");
            }
        }
        expect(packed.sort()).toEqual([
            "@genome-spy/app",
            "@genome-spy/core",
            "@genome-spy/inspector",
            "@genome-spy/react-component",
        ]);
        git(cwd, ["tag", "-a", "v2.0.0", "-m", "v2.0.0"]);
        expect(git(cwd, ["tag"])).toBe("v1.0.0\nv2.0.0");
        expect(
            JSON.parse(git(cwd, ["show", "v2.0.0:packages/core/package.json"]))
                .version
        ).toBe("2.0.0");
    });

    test("empty fragments record no release and cannot bump the baseline", async () => {
        const cwd = await fixture();
        await addChangeset(cwd, "---\n---\n");
        expect((await readReleasePlan(cwd)).releases).toEqual([]);
        await expect(prepareRelease(cwd)).rejects.toThrow(
            "No releasable changesets"
        );
        expect((await readJson(path.join(cwd, "lerna.json"))).version).toBe(
            "1.0.0"
        );
    });

    test("rejects unknown packages and an expanded npm publication boundary", async () => {
        const cwd = await fixture();
        await writeFile(
            path.join(cwd, ".changeset/change.md"),
            '---\n"@genome-spy/missing": patch\n---\n\nFix it.\n'
        );
        await expect(readReleasePlan(cwd)).rejects.toThrow();
        await rm(path.join(cwd, ".changeset/change.md"));
        const filename = path.join(
            cwd,
            "packages/webgpu-renderer/package.json"
        );
        const manifest = await readJson(filename);
        manifest.private = false;
        await writeJson(filename, manifest);
        await expect(readReleasePlan(cwd)).rejects.toThrow(
            "Only App, Core, Inspector, and React"
        );
    });
});

test("PRs and direct commits need a note or an intentional no-release marker", async () => {
    const cwd = await fixture();
    const base = git(cwd, ["rev-parse", "HEAD"]);
    await writeFile(path.join(cwd, "internal.txt"), "A maintenance change.\n");
    commit(cwd);
    await expect(checkChangesets(cwd, base)).rejects.toThrow(
        "Add or update a .changeset"
    );

    await addChangeset(cwd, "---\n---\n");
    await expect(checkChangesets(cwd, base)).resolves.toBeUndefined();
    const next = git(cwd, ["rev-parse", "HEAD"]);
    await writeFile(
        path.join(cwd, "internal.txt"),
        "An independent maintenance change.\n"
    );
    await expect(checkChangesets(cwd, next)).rejects.toThrow(
        "Add or update a .changeset"
    );
    await writeFile(path.join(cwd, ".changeset/second.md"), "---\n---\n");
    await expect(checkChangesets(cwd, next)).resolves.toBeUndefined();
});
