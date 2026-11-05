import process from "node:process";
import { fileURLToPath, URLSearchParams } from "node:url";

/**
 * Require the latest master-push checks for the commit being published.
 * @param {string} repository
 * @param {string} sha
 * @param {string} token
 */
export async function verifyReleaseCi(repository, sha, token) {
    for (const workflow of ["node.js.yml", "changesets.yml"]) {
        const query = new URLSearchParams({
            branch: "master",
            event: "push",
            head_sha: sha,
            per_page: "1",
        });
        const response = await globalThis.fetch(
            `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?${query}`,
            {
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: "Bearer " + token,
                    "X-GitHub-Api-Version": "2026-03-10",
                },
            }
        );
        if (!response.ok) {
            throw new Error(
                `Cannot verify ${workflow}: GitHub returned HTTP ${response.status}.`
            );
        }

        const { workflow_runs: runs } = await response.json();
        const run = runs[0];
        if (
            !run ||
            run.head_sha !== sha ||
            run.head_branch !== "master" ||
            run.event !== "push" ||
            run.status !== "completed" ||
            run.conclusion !== "success"
        ) {
            throw new Error(
                `Publication requires successful ${workflow} push CI on master for ${sha}. ` +
                    "Wait for CI to pass before starting publication."
            );
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { GITHUB_REPOSITORY, GITHUB_SHA, GH_TOKEN } = process.env;
    if (!GITHUB_REPOSITORY || !GITHUB_SHA || !GH_TOKEN) {
        throw new Error(
            "CI verification requires GITHUB_REPOSITORY, GITHUB_SHA and GH_TOKEN."
        );
    }

    await verifyReleaseCi(GITHUB_REPOSITORY, GITHUB_SHA, GH_TOKEN);
    process.stdout.write("Both CI workflows passed for " + GITHUB_SHA + ".\n");
}
