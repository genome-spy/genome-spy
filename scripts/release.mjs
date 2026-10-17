import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getReleasePlan } from "@changesets/get-release-plan";
import { parseNote } from "./changelog.mjs";

const releaseHeading = /^#{1,2} \[\d+\.\d+\.\d+\]/m;

const packageLabels = new Map([
    ["@genome-spy/core", "Core"],
    ["@genome-spy/app", "App"],
    ["@genome-spy/app-agent", "App Agent"],
    ["@genome-spy/doc-embed", "Doc Embed"],
    ["@genome-spy/embed-examples", "Embed Examples"],
    ["@genome-spy/inspector", "Inspector"],
    ["@genome-spy/playground", "Playground"],
    ["@genome-spy/react-component", "React"],
]);

export const publicPackages = [
    "@genome-spy/app",
    "@genome-spy/core",
    "@genome-spy/inspector",
    "@genome-spy/react-component",
];

/** @param {string} filename */
export async function readJson(filename) {
    return JSON.parse(await readFile(filename, "utf8"));
}

/** @param {string} cwd @returns {Promise<string>} */
export async function releaseVersion(cwd) {
    return (await readJson(path.join(cwd, "packages/core/package.json")))
        .version;
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
    if (versions.size !== 1 || !versions.has(await releaseVersion(cwd))) {
        throw new Error("Release packages must share Core's version.");
    }
    // TODO: Support prerelease entry/exit, archived notes, and channel-aware
    // verification together; see CONTRIBUTING.md#future-major-release-lines.
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
        if (changeset.releases.length) {
            parseNote(changeset);
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

    for (const [category, heading] of /** @type {const} */ ([
        ["breaking", "Breaking changes"],
        ["feature", "New features"],
        ["improvement", "Improvements"],
        ["fix", "Fixes"],
    ])) {
        const lines = [];
        for (const changeset of plan.changesets) {
            if (!changeset.releases.length) {
                continue;
            }
            const note = parseNote(changeset);
            const bump = ["major", "minor", "patch"].find((candidate) =>
                changeset.releases.some((release) => release.type === candidate)
            );
            if ((bump === "major" ? "breaking" : note.category) !== category) {
                continue;
            }

            const labels = changeset.releases
                .map(({ name }) => {
                    const label = packageLabels.get(name);
                    if (!label) {
                        throw new Error(`Missing release label for ${name}.`);
                    }
                    return label;
                })
                .sort();

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
                        {
                            ...changeset,
                            commit,
                            summary: `<!-- category: ${note.category} -->\n\n**${labels.join(", ")}:** ${note.summary}`,
                        },
                        /** @type {import("@changesets/types").VersionType} */ (
                            bump
                        ),
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

/** @param {string} cwd @param {{ intro?: string }} [options] */
export async function prepareRelease(cwd, { intro = "" } = {}) {
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
    const notes =
        [intro.trim(), (await aggregateNotes(cwd, plan)).trim()]
            .filter(Boolean)
            .join("\n\n") + "\n";
    const changelogPath = path.join(cwd, "CHANGELOG.md");
    const changelog = await readFile(changelogPath, "utf8");
    const firstRelease = changelog.search(releaseHeading);
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

/**
 * Add release-wide GitHub credits without replacing the reviewed Changesets notes.
 * @param {{ repo: string, tag: string, previousTag: string, target: string }} release
 */
async function contributorCredits({ repo, tag, previousTag, target }) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error(
            "GitHub contributor credits require GH_TOKEN or GITHUB_TOKEN."
        );
    }

    /** @param {string} resource @param {Record<string, string>} [body] */
    async function request(resource, body) {
        const response = await globalThis.fetch(
            `https://api.github.com/repos/${repo}/${resource}`,
            {
                method: body ? "POST" : "GET",
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: "Bearer " + token,
                    "Content-Type": "application/json",
                    "X-GitHub-Api-Version": "2026-03-10",
                },
                body: body ? JSON.stringify(body) : undefined,
            }
        );
        if (!response.ok) {
            throw new Error(
                `GitHub ${resource} failed: HTTP ${response.status}.`
            );
        }
        return response.json();
    }

    const generated = /** @type {{ body: string }} */ (
        await request("releases/generate-notes", {
            tag_name: tag,
            previous_tag_name: previousTag,
            target_commitish: target,
        })
    );
    const newcomers =
        generated.body
            .replaceAll("\r\n", "\n")
            .split(/^## /m)
            .find((section) => section.startsWith("New Contributors\n"))
            ?.split(/^\*\*Full Changelog\*\*:/m)[0]
            .slice("New Contributors".length)
            .trim() ?? "";

    // GitHub's generated notes cover PR authors; comparisons also cover direct commits.
    /** @type {Map<string, string>} */
    const contributors = new Map();
    for (const match of generated.body.matchAll(
        / by @([a-z\d-]+(?:\[bot\])?) in /gi
    )) {
        contributors.set(match[1].toLowerCase(), match[1]);
    }
    for (const match of newcomers.matchAll(/@([a-z\d-]+(?:\[bot\])?)/gi)) {
        contributors.set(match[1].toLowerCase(), match[1]);
    }
    for (let page = 1; ; page++) {
        const comparison =
            /** @type {{ commits: { author: { login: string } | null }[] }} */ (
                await request(
                    `compare/${previousTag}...${target}?per_page=100&page=${page}`
                )
            );
        for (const { author } of comparison.commits) {
            if (author) {
                contributors.set(author.login.toLowerCase(), author.login);
            }
        }
        if (comparison.commits.length < 100) {
            break;
        }
    }

    const sections = [];
    if (newcomers) {
        sections.push("## New Contributors\n\n" + newcomers);
    }
    if (contributors.size) {
        const mentions = Array.from(contributors.values())
            .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
            .map((login) => "@" + login);
        sections.push(`Thanks to ${mentions.join(", ")}!`);
    }
    return sections.join("\n\n");
}

/**
 * @param {string} cwd
 * @param {{ github?: boolean }} [options]
 */
export async function releaseNotes(cwd, { github = false } = {}) {
    const version = await releaseVersion(cwd);
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
    const nextRelease = rest.search(releaseHeading);
    const notes = (
        nextRelease === -1 ? rest : rest.slice(0, nextRelease)
    ).trim();
    if (!github) {
        return notes + "\n";
    }

    // Use the reviewed changelog's exact release range, before the new tag exists.
    const comparison =
        /\]\(https:\/\/github\.com\/([^/]+\/[^/]+)\/compare\/(v\d+\.\d+\.\d+)\.\.\.(v\d+\.\d+\.\d+)\)/.exec(
            match[0]
        );
    if (!comparison || comparison[3] !== "v" + version) {
        throw new Error(
            "GitHub release notes require a stable comparison link in the release heading."
        );
    }
    const credits = await contributorCredits({
        repo: comparison[1],
        tag: comparison[3],
        previousTag: comparison[2],
        target: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd,
            encoding: "utf8",
        }).trim(),
    });
    return notes + (credits ? "\n\n" + credits : "") + "\n";
}

/**
 * Publish reviewed manifest versions only after their fragments are consumed.
 * @param {string} cwd
 * @param {string} expectedVersion
 */
export async function verifyRelease(cwd, expectedVersion) {
    const plan = await readReleasePlan(cwd);
    const version = await releaseVersion(cwd);
    if (!/^\d+\.\d+\.\d+$/.test(version) || version !== expectedVersion) {
        throw new Error(
            `Expected stable version ${expectedVersion}, found ${version}.`
        );
    }
    if (plan.releases.length) {
        throw new Error(
            "Run release:version and commit the result before publishing."
        );
    }
    await releaseNotes(cwd);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    switch (process.argv[2]) {
        case "version": {
            const args = process.argv.slice(3);
            if (args.length && (args.length !== 2 || args[0] !== "--intro")) {
                throw new Error("Expected version [--intro <Markdown file>].");
            }
            await prepareRelease(process.cwd(), {
                intro: args.length ? await readFile(args[1], "utf8") : "",
            });
            break;
        }
        case "notes":
            process.stdout.write(
                await releaseNotes(process.cwd(), {
                    github: process.argv[3] === "--github",
                })
            );
            break;
        case "verify":
            await verifyRelease(
                process.cwd(),
                process.argv[3] ?? (await releaseVersion(process.cwd()))
            );
            break;
        default:
            throw new Error("Expected version, notes, or verify.");
    }
}
