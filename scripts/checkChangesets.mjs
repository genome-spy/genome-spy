import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readJson, readReleasePlan, releaseNotes } from "./release.mjs";

/**
 * Require an intentional release/no-release decision for a contribution.
 * A version commit consumes fragments instead of adding another one.
 * @param {string} cwd
 * @param {string | undefined} since
 */
export async function checkChangesets(cwd, since) {
    await readReleasePlan(cwd);
    if (!since) {
        return;
    }

    const diff = execFileSync(
        "git",
        ["diff", "--name-status", "--no-renames", since],
        { cwd, encoding: "utf8" }
    ).trim();
    const untracked = execFileSync(
        "git",
        ["ls-files", "--others", "--exclude-standard"],
        { cwd, encoding: "utf8" }
    ).trim();
    const files = [
        ...diff
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("\t")),
        ...untracked
            .split("\n")
            .filter(Boolean)
            .map((filename) => ["A", filename]),
    ];
    if (!files.length) {
        return;
    }
    const isFragment = /** @param {string} filename */ (filename) =>
        /^\.changeset\/(?!README\.md$)[^/]+\.md$/.test(filename);

    if (
        files.some(
            ([status, filename]) =>
                (status === "A" || status === "M") && isFragment(filename)
        )
    ) {
        return;
    }

    // A push may contain both a feature commit and the release that consumes it.
    const deleted = execFileSync(
        "git",
        [
            "log",
            "--format=",
            "--name-only",
            "--diff-filter=D",
            `${since}..HEAD`,
            "--",
            ".changeset",
        ],
        { cwd, encoding: "utf8" }
    );
    const consumed =
        files.some(
            ([status, filename]) => status === "D" && isFragment(filename)
        ) || deleted.split("\n").some(isFragment);
    const manifestPath = "packages/core/package.json";
    const releaseFiles = [manifestPath, "CHANGELOG.md", "package-lock.json"];
    if (
        consumed &&
        releaseFiles.every((filename) =>
            files.some(([status, file]) => status === "M" && file === filename)
        )
    ) {
        const before = JSON.parse(
            execFileSync("git", ["show", `${since}:${manifestPath}`], {
                cwd,
                encoding: "utf8",
            })
        );
        const after = await readJson(path.join(cwd, manifestPath));
        if (before.version !== after.version) {
            await releaseNotes(cwd);
            return;
        }
    }

    throw new Error(
        "Add or update a .changeset/*.md release note, or run npm run changeset -- --empty for an intentional no-release change."
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await checkChangesets(process.cwd(), process.argv[2]);
    process.stdout.write("Changesets and release package policy are valid.\n");
}
