import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getReleasePlan } from "@changesets/get-release-plan";

const publicPackages = [
    "@genome-spy/app",
    "@genome-spy/core",
    "@genome-spy/inspector",
    "@genome-spy/react-component",
];

/** @param {string} filename */
export async function readJson(filename) {
    return JSON.parse(await readFile(filename, "utf8"));
}

/**
 * Validate the supported fixed release group and npm publication boundary.
 * @param {string} cwd
 */
export async function readReleasePlan(cwd) {
    const config = await readJson(path.join(cwd, ".changeset/config.json"));
    const plan = await getReleasePlan(cwd);
    const names = new Set(config.fixed.flat());
    const versions = new Set();
    const publishable = new Set();

    const directories = await readdir(path.join(cwd, "packages"), {
        withFileTypes: true,
    });
    for (const directory of directories.filter((entry) =>
        entry.isDirectory()
    )) {
        const manifest = await readJson(
            path.join(cwd, "packages", directory.name, "package.json")
        );
        if (names.has(manifest.name)) {
            versions.add(manifest.version);
        }
        if (!manifest.private) {
            publishable.add(manifest.name);
        }
    }

    if (
        publishable.size !== publicPackages.length ||
        publicPackages.some(
            (name) => !publishable.has(name) || !names.has(name)
        )
    ) {
        throw new Error(
            "Only App, Core, Inspector, and React may be published."
        );
    }
    if (
        config.fixed.length !== 1 ||
        names.size !== 8 ||
        names.has("@genome-spy/webgpu-renderer") ||
        config.ignore.length !== 1 ||
        !config.ignore.includes("@genome-spy/webgpu-renderer") ||
        config.commit !== false ||
        config.access !== "public" ||
        !config.privatePackages.version ||
        config.privatePackages.tag
    ) {
        throw new Error(
            "Preserve the eight-package group and private-package policy."
        );
    }
    const lerna = await readJson(path.join(cwd, "lerna.json"));
    if (versions.size !== 1 || !versions.has(lerna.version)) {
        throw new Error(
            "Release packages and lerna.json must share one version."
        );
    }
    if (plan.preState) {
        throw new Error("This release workflow supports stable releases only.");
    }
    if (
        plan.releases.some((release) => !names.has(release.name)) ||
        (plan.releases.length &&
            (plan.releases.length !== names.size ||
                new Set(plan.releases.map((release) => release.newVersion))
                    .size !== 1))
    ) {
        throw new Error(
            "The release plan must synchronize the complete fixed group."
        );
    }
    for (const changeset of plan.changesets) {
        if (changeset.releases.some((release) => !names.has(release.name))) {
            throw new Error(
                `Changeset ${changeset.id} targets a package outside the release group.`
            );
        }
        if (changeset.releases.length && !changeset.summary.trim()) {
            throw new Error(
                `Changeset ${changeset.id} needs a user-facing summary.`
            );
        }
    }

    return plan;
}

/**
 * Render each fragment once, even when it affects several fixed packages.
 * Reuse the package formatter for PR links and contributor attribution.
 * @param {string} cwd
 * @param {Awaited<ReturnType<typeof getReleasePlan>>} plan
 */
async function aggregateNotes(cwd, plan) {
    const config = await readJson(path.join(cwd, ".changeset/config.json"));
    const [moduleName, options] = config.changelog;
    const require = createRequire(path.join(cwd, ".changeset/config.json"));
    const formatter = (
        await import(pathToFileURL(require.resolve(moduleName)).href)
    ).default;
    const sections = [];

    for (const [type, heading] of /** @type {const} */ ([
        ["major", "Breaking changes"],
        ["minor", "New features"],
        ["patch", "Fixes"],
    ])) {
        const lines = [];
        for (const changeset of plan.changesets) {
            const bump = ["major", "minor", "patch"].find((candidate) =>
                changeset.releases.some((release) => release.type === candidate)
            );
            if (bump !== type) {
                continue;
            }

            const commit = execFileSync(
                "git",
                [
                    "log",
                    "--diff-filter=A",
                    "--format=%H",
                    "-1",
                    "--",
                    `.changeset/${changeset.id}.md`,
                ],
                { cwd, encoding: "utf8" }
            ).trim();
            lines.push(
                (
                    await formatter.getReleaseLine(
                        { ...changeset, commit },
                        type,
                        options
                    )
                ).trim()
            );
        }
        if (lines.length) {
            sections.push(`### ${heading}\n\n${lines.join("\n\n")}`);
        }
    }

    return sections.join("\n\n") + "\n";
}

/** @param {string} cwd */
export async function prepareRelease(cwd) {
    if (
        execFileSync("git", ["status", "--porcelain"], {
            cwd,
            encoding: "utf8",
        }).trim()
    ) {
        throw new Error(
            "Commit the changesets and start from a clean working tree."
        );
    }
    const plan = await readReleasePlan(cwd);
    if (!plan.releases.length) {
        throw new Error(
            "No releasable changesets. Empty fragments do not bump versions."
        );
    }
    const release = plan.releases[0];
    const notes = await aggregateNotes(cwd, plan);
    const changelogPath = path.join(cwd, "CHANGELOG.md");
    const changelog = await readFile(changelogPath, "utf8");
    const firstRelease = changelog.search(/^#{1,2} \[/m);
    if (firstRelease === -1) {
        throw new Error(
            "The root changelog must contain the previous release history."
        );
    }

    execFileSync(
        process.execPath,
        [
            fileURLToPath(import.meta.resolve("@changesets/cli/bin.js")),
            "version",
        ],
        { cwd, stdio: "inherit" }
    );
    execFileSync(
        "npm",
        [
            "install",
            "--package-lock-only",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
        ],
        { cwd, stdio: "inherit" }
    );

    const lernaPath = path.join(cwd, "lerna.json");
    const lerna = await readJson(lernaPath);
    lerna.version = release.newVersion;
    await writeFile(lernaPath, JSON.stringify(lerna, null, 2) + "\n");

    const date = new Date().toISOString().slice(0, 10);
    const heading = `## [${release.newVersion}](https://github.com/genome-spy/genome-spy/compare/v${release.oldVersion}...v${release.newVersion}) (${date})`;
    await writeFile(
        changelogPath,
        changelog.slice(0, firstRelease) +
            `${heading}\n\n${notes}\n` +
            changelog.slice(firstRelease)
    );
    await readReleasePlan(cwd);
}

/** @param {string} cwd */
export async function releaseNotes(cwd) {
    const { version } = await readJson(path.join(cwd, "lerna.json"));
    const changelog = await readFile(path.join(cwd, "CHANGELOG.md"), "utf8");
    const heading = new RegExp(
        `^#{1,2} \\[${version.replaceAll(".", "\\.")}\\].*$`,
        "m"
    );
    const match = heading.exec(changelog);
    if (!match) {
        throw new Error(`Missing root release notes for ${version}.`);
    }
    const rest = changelog.slice(match.index + match[0].length);
    const nextRelease = rest.search(/^#{1,2} \[/m);
    return (
        (nextRelease === -1 ? rest : rest.slice(0, nextRelease)).trim() + "\n"
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    switch (process.argv[2]) {
        case "version":
            await prepareRelease(process.cwd());
            break;
        case "notes":
            process.stdout.write(await releaseNotes(process.cwd()));
            break;
        default:
            throw new Error("Expected version or notes.");
    }
}
