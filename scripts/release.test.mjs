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
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { checkChangesets } from "./checkChangesets.mjs";
import { verifyPackedPackages } from "./verifyPackedPackages.mjs";
import {
    prepareRelease,
    readJson,
    readReleasePlan,
    releaseNotes,
    releaseVersion,
    verifyRelease,
} from "./release.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
/** @type {string[]} */
const fixtures = [];

afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
    // Exercise the real formatter; the fixture adapter omits commits to avoid GitHub lookups.
    config.format = false;
    await writeJson(path.join(cwd, ".changeset/config.json"), config);
    await mkdir(path.join(cwd, "scripts"));
    await writeFile(
        path.join(cwd, "scripts/changelog.mjs"),
        `import formatter from ${JSON.stringify(new URL("./changelog.mjs", import.meta.url).href)};
const offline = (changeset) => ({ ...changeset, commit: undefined });
export default {
    getReleaseLine: (changeset, type, options) => formatter.getReleaseLine(offline(changeset), type, options),
    getDependencyReleaseLine: (changesets, dependencies, options) => formatter.getDependencyReleaseLine(changesets.map(offline), dependencies, options),
};\n`
    );
    await writeJson(path.join(cwd, "package.json"), {
        name: "release-fixture",
        private: true,
        workspaces: ["packages/*"],
        scripts: {
            "release:pack": (
                await readJson(path.join(repoRoot, "package.json"))
            ).scripts["release:pack"],
        },
    });
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
                // Match the fixture baseline even after the checkout is versioned.
                manifest[field] = Object.fromEntries(
                    internal.map(([name]) => [name, "^1.0.0"])
                );
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
    // Prevent background Git maintenance from racing with fixture cleanup.
    git(cwd, ["config", "maintenance.auto", "false"]);
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
                `---\n"${name}": ${type}\n---\n\n<!-- category: ${type === "patch" ? "fix" : "feature"} -->\n\nKeep axis labels consistent.\n`
            );
            const baseline = git(cwd, ["rev-parse", "HEAD"]);
            const plan = await readReleasePlan(cwd);
            expect(plan.releases).toHaveLength(8);
            expect(
                new Set(plan.releases.map((release) => release.newVersion))
            ).toEqual(new Set([version]));

            await prepareRelease(cwd);

            expect(await releaseVersion(cwd)).toBe(version);
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
                await readFile(
                    path.join(cwd, "packages/core/CHANGELOG.md"),
                    "utf8"
                )
            ).not.toContain("category:");
            expect(
                await readFile(path.join(cwd, "CHANGELOG.md"), "utf8")
            ).toContain("Existing history.");
            expect(git(cwd, ["rev-parse", "HEAD"])).toBe(baseline);
            expect(git(cwd, ["tag"])).toBe("v1.0.0");
        }
    );

    test("empty fragments record no release and cannot bump the baseline", async () => {
        const cwd = await fixture();
        await addChangeset(cwd, "---\n---\n");
        expect((await readReleasePlan(cwd)).releases).toEqual([]);
        await expect(prepareRelease(cwd)).rejects.toThrow(
            "No releasable changesets"
        );
        expect(await releaseVersion(cwd)).toBe("1.0.0");
    });

    test("rejects unknown packages and an expanded npm publication boundary", async () => {
        const cwd = await fixture();
        await writeFile(
            path.join(cwd, ".changeset/change.md"),
            '---\n"@genome-spy/missing": patch\n---\n\n<!-- category: fix -->\n\nFix it.\n'
        );
        await expect(checkChangesets(cwd)).rejects.toThrow();
        await rm(path.join(cwd, ".changeset/change.md"));
        const filename = path.join(
            cwd,
            "packages/webgpu-renderer/package.json"
        );
        const manifest = await readJson(filename);
        manifest.private = false;
        await writeJson(filename, manifest);
        await expect(checkChangesets(cwd)).rejects.toThrow(
            "Only App, Core, Inspector, and React"
        );
    });
});

test("groups categories independently of bumps, labels direct packages, and accepts release prose", async () => {
    const cwd = await fixture();
    const notes = [
        [
            "feature",
            '"@genome-spy/core": minor\n"@genome-spy/app": minor',
            "Add shared controls.",
        ],
        [
            "improvement",
            '"@genome-spy/playground": patch',
            "Make controls easier to navigate.",
        ],
        ["fix", '"@genome-spy/core": patch', "Keep axis labels visible."],
        [
            "feature",
            '"@genome-spy/core": major',
            "Replace the old API.\n\nMigration: rename oldProperty to newProperty.",
        ],
    ];
    for (const [category, packages, summary] of notes) {
        await writeFile(
            path.join(
                cwd,
                ".changeset",
                category + "-" + summary.slice(0, 3) + ".md"
            ),
            `---\n${packages}\n---\n\n<!-- category: ${category} -->\n\n${summary}\n`
        );
    }
    commit(cwd);

    // An introduction is editorial Markdown, outside the fragments consumed by Changesets.
    const introPath = path.join(cwd, ".git/release-intro.md");
    const intro =
        "This release improves everyday navigation.\n\n## [Highlights](https://genomespy.app/)\n\nRead the migration notes before upgrading.";
    await writeFile(introPath, intro);
    execFileSync(
        process.execPath,
        [
            path.join(repoRoot, "scripts/release.mjs"),
            "version",
            "--intro",
            introPath,
        ],
        { cwd, stdio: "pipe" }
    );

    const prepared = await releaseNotes(cwd);
    expect(prepared).toContain(
        intro + "\n\n### Breaking changes\n\n- **Core:** Replace the old API."
    );
    expect(prepared).toContain(
        "### New features\n\n- **App, Core:** Add shared controls."
    );
    expect(prepared).toContain(
        "### Improvements\n\n- **Playground:** Make controls easier to navigate."
    );
    expect(prepared).toContain(
        "### Fixes\n\n- **Core:** Keep axis labels visible."
    );
    expect(prepared.match(/Add shared controls\./g)).toHaveLength(1);
    expect(prepared).toContain("Migration: rename oldProperty to newProperty.");
    expect(prepared).not.toMatch(/category:|App Agent|Inspector|React/);
    for (const name of ["core", "app", "playground"]) {
        const changelog = await readFile(
            path.join(cwd, "packages", name, "CHANGELOG.md"),
            "utf8"
        );
        expect(changelog).not.toContain("category:");
    }
    expect(await releaseVersion(cwd)).toBe("2.0.0");
});

test("release checks reject missing, invalid, duplicated, and prose-free category markers", async () => {
    const cwd = await fixture();
    for (const summary of [
        "Fix axis labels.",
        "<!-- category: typo -->\n\nFix axis labels.",
        "<!-- category: fix -->\n\n<!-- category: feature -->\n\nFix axis labels.",
        "<!-- category: fix -->",
    ]) {
        await writeFile(
            path.join(cwd, ".changeset/invalid.md"),
            '---\n"@genome-spy/core": patch\n---\n\n' + summary + "\n"
        );
        await expect(checkChangesets(cwd)).rejects.toThrow(/Changeset invalid/);
    }
});

test("publication requires consumed fragments and the reviewed stable version", async () => {
    const cwd = await fixture();
    await addChangeset(
        cwd,
        '---\n"@genome-spy/core": patch\n---\n\n<!-- category: fix -->\n\nKeep axis labels consistent.\n'
    );
    await expect(verifyRelease(cwd, "1.0.0")).rejects.toThrow(
        "before publishing"
    );
    await prepareRelease(cwd);
    await expect(verifyRelease(cwd, "1.0.1")).resolves.toBeUndefined();
    await expect(verifyRelease(cwd, "1.1.0")).rejects.toThrow(
        "Expected stable version"
    );
    await writeFile(path.join(cwd, "CHANGELOG.md"), "# Change Log\n");
    await expect(verifyRelease(cwd, "1.0.1")).rejects.toThrow(
        "Missing root release notes"
    );
});

test("GitHub credits preserve reviewed notes and include new, returning, and direct-commit authors", async () => {
    const cwd = await fixture();
    await addChangeset(
        cwd,
        '---\n"@genome-spy/core": patch\n---\n\n<!-- category: fix -->\n\nKeep axis labels consistent.\n'
    );
    const intro =
        "A release introduction.\n\n## [Highlights](https://genomespy.app/)\n\nSome editorial context.";
    await prepareRelease(cwd, { intro });
    commit(cwd);
    const target = git(cwd, ["rev-parse", "HEAD"]);
    const changelog = await readFile(path.join(cwd, "CHANGELOG.md"), "utf8");

    const generated = [
        "## What's Changed",
        "",
        "* Generated PR summary by @pr-author in https://github.com/genome-spy/genome-spy/pull/123",
        "* Another PR by @returning in https://github.com/genome-spy/genome-spy/pull/124",
        "",
        "## New Contributors",
        "",
        "* @new-user made their first contribution in https://github.com/genome-spy/genome-spy/pull/125",
        "",
        "**Full Changelog**: https://github.com/genome-spy/genome-spy/compare/v1.0.0...v1.0.1",
    ].join("\r\n");
    // A full first page must not hide direct-commit authors on later pages.
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(globalThis.Response.json({ body: generated }))
        .mockResolvedValueOnce(
            globalThis.Response.json({
                commits: Array.from({ length: 100 }, () => ({
                    author: { login: "Returning" },
                })),
            })
        )
        .mockResolvedValueOnce(
            globalThis.Response.json({
                commits: [{ author: { login: "direct" } }, { author: null }],
            })
        );
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("GH_TOKEN", "fixture-token");

    const reviewedNotes = await releaseNotes(cwd);
    expect(reviewedNotes).toContain(intro);
    expect(fetch).not.toHaveBeenCalled();
    const notes = await releaseNotes(cwd, { github: true });
    expect(notes).toBe(
        reviewedNotes.trimEnd() +
            "\n\n## New Contributors\n\n" +
            "* @new-user made their first contribution in https://github.com/genome-spy/genome-spy/pull/125\n\n" +
            "Thanks to @direct, @new-user, @pr-author, @Returning!\n"
    );
    expect(fetch.mock.calls[0][0]).toBe(
        "https://api.github.com/repos/genome-spy/genome-spy/releases/generate-notes"
    );
    const request = fetch.mock.calls[0][1];
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe("Bearer fixture-token");
    expect(JSON.parse(request.body)).toEqual({
        tag_name: "v1.0.1",
        previous_tag_name: "v1.0.0",
        target_commitish: target,
    });
    expect(fetch.mock.calls.slice(1).map(([url]) => url)).toEqual([
        `https://api.github.com/repos/genome-spy/genome-spy/compare/v1.0.0...${target}?per_page=100&page=1`,
        `https://api.github.com/repos/genome-spy/genome-spy/compare/v1.0.0...${target}?per_page=100&page=2`,
    ]);
    expect(await readFile(path.join(cwd, "CHANGELOG.md"), "utf8")).toBe(
        changelog
    );
});

test("GitHub credits omit empty sections and use GITHUB_TOKEN when GH_TOKEN is absent", async () => {
    const cwd = await fixture();
    await addChangeset(
        cwd,
        '---\n"@genome-spy/core": patch\n---\n\n<!-- category: fix -->\n\nKeep axis labels consistent.\n'
    );
    await prepareRelease(cwd);
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(
            globalThis.Response.json({ body: "**Full Changelog**: comparison" })
        )
        .mockResolvedValueOnce(
            globalThis.Response.json({ commits: [{ author: null }] })
        );
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("GH_TOKEN", "");
    vi.stubEnv("GITHUB_TOKEN", "fixture-token");

    expect(await releaseNotes(cwd, { github: true })).toBe(
        await releaseNotes(cwd)
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer fixture-token"
    );
});

test("GitHub credits fail on API errors instead of silently publishing incomplete credits", async () => {
    const cwd = await fixture();
    await addChangeset(
        cwd,
        '---\n"@genome-spy/core": patch\n---\n\n<!-- category: fix -->\n\nKeep axis labels consistent.\n'
    );
    await prepareRelease(cwd);
    vi.stubEnv("GH_TOKEN", "fixture-token");
    vi.stubGlobal(
        "fetch",
        vi
            .fn()
            .mockResolvedValueOnce(globalThis.Response.json({ body: "" }))
            .mockResolvedValueOnce(
                new globalThis.Response(null, { status: 403 })
            )
    );

    await expect(releaseNotes(cwd, { github: true })).rejects.toThrow(
        "HTTP 403"
    );
});

test("verifies public archives, Core's packing lifecycle, and missing build outputs", async () => {
    const cwd = await fixture();
    const coreDir = path.join(cwd, "packages/core");
    const manifestPath = path.join(coreDir, "package.json");
    const manifest = await readJson(manifestPath);
    manifest.type = "module";
    manifest.files = ["dist/"];
    manifest.exports = { ".": "./src/index.js", "./data/*": "./src/data/*" };
    const actual = await readJson(
        path.join(repoRoot, "packages/core/package.json")
    );
    manifest.scripts = {
        prepack: actual.scripts.prepack,
        postpack: actual.scripts.postpack,
    };
    await writeJson(manifestPath, manifest);
    await mkdir(path.join(coreDir, "scripts"));
    for (const hook of ["prepack", "postpack"]) {
        await writeFile(
            path.join(coreDir, "scripts", `${hook}.mjs`),
            await readFile(
                path.join(repoRoot, "packages/core/scripts", `${hook}.mjs`)
            )
        );
    }
    await mkdir(path.join(coreDir, "dist/src/data"), { recursive: true });
    await writeFile(
        path.join(coreDir, "dist/src/index.js"),
        "export const embed = 1;\n"
    );
    await writeFile(
        path.join(coreDir, "dist/src/data/source.js"),
        "export const data = 1;\n"
    );
    const original = await readFile(manifestPath, "utf8");
    const artifacts = path.join(cwd, "artifacts");
    await mkdir(artifacts);
    const packedFile = path.join(artifacts, "packed-packages.json");
    const appPath = path.join(cwd, "packages/app/package.json");
    const app = await readJson(appPath);
    // Bundle smoke tests can clear dist after the full build wrote the schema.
    app.exports = { "./schema.json": "./dist/schema.json" };
    await writeJson(appPath, app);
    async function pack() {
        const packed = JSON.parse(
            execFileSync(
                "npm",
                [
                    "run",
                    "--silent",
                    "release:pack",
                    "--",
                    "--pack-destination",
                    artifacts,
                    "--json",
                    "--offline",
                    "--cache",
                    path.join(artifacts, "cache"),
                ],
                { cwd, encoding: "utf8" }
            )
        );
        await writeJson(packedFile, packed);
        return packed;
    }
    await pack();
    await expect(verifyPackedPackages(cwd, packedFile)).rejects.toThrow(
        "@genome-spy/app is missing archived entry dist/schema.json"
    );
    await mkdir(path.join(cwd, "packages/app/dist"));
    await writeFile(path.join(cwd, "packages/app/dist/schema.json"), "{}\n");
    const packed = await pack();
    await expect(
        verifyPackedPackages(cwd, packedFile)
    ).resolves.toBeUndefined();
    expect(packed.map((pkg) => pkg.name).sort()).toEqual([
        "@genome-spy/app",
        "@genome-spy/core",
        "@genome-spy/inspector",
        "@genome-spy/react-component",
    ]);
    const core = packed.find((pkg) => pkg.name === "@genome-spy/core");
    expect(core.files.map((file) => file.path)).toEqual([
        "dist/src/data/source.js",
        "dist/src/index.js",
        "package.json",
    ]);
    const tarManifest = JSON.parse(
        execFileSync(
            "tar",
            [
                "-xOf",
                path.join(artifacts, core.filename),
                "package/package.json",
            ],
            { encoding: "utf8" }
        )
    );
    expect(tarManifest.exports).toEqual({
        ".": "./dist/src/index.js",
        "./data/*": "./dist/src/data/*",
    });
    expect(await readFile(manifestPath, "utf8")).toBe(original);
    await expect(
        readFile(path.join(coreDir, "package.prepack-backup.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
});

test("release check accepts dependency maintenance without a fragment", async () => {
    const cwd = await fixture();
    const manifestPath = path.join(cwd, "package.json");
    const manifest = await readJson(manifestPath);
    manifest.devDependencies = { vite: "^8.3.4" };
    await writeJson(manifestPath, manifest);
    commit(cwd);

    const output = execFileSync(
        process.execPath,
        [path.join(repoRoot, "scripts/checkChangesets.mjs")],
        { cwd, encoding: "utf8" }
    );
    expect(output).toContain(
        "Changesets and release package policy are valid."
    );
    expect((await readReleasePlan(cwd)).releases).toEqual([]);
});
