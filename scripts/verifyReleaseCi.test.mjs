import { afterEach, describe, expect, test, vi } from "vitest";
import { verifyReleaseCi } from "./verifyReleaseCi.mjs";

const repository = "genome-spy/genome-spy";
const sha = "a".repeat(40);
const successfulRun = {
    head_sha: sha,
    head_branch: "master",
    event: "push",
    status: "completed",
    conclusion: "success",
};

afterEach(() => vi.unstubAllGlobals());

/** @param {Record<string, unknown>[]} runs */
function stubRuns(runs) {
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(
            new globalThis.Response(JSON.stringify({ workflow_runs: runs }))
        );
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

describe("release CI prerequisite", () => {
    test("requires the consolidated CI run for the exact master-push commit", async () => {
        const fetch = stubRuns([successfulRun]);

        await verifyReleaseCi(repository, sha, "test-token");

        expect(fetch).toHaveBeenCalledTimes(1);
        const url = new globalThis.URL(fetch.mock.calls[0][0]);
        expect(url.pathname).toBe(
            `/repos/${repository}/actions/workflows/node.js.yml/runs`
        );
        expect(Object.fromEntries(url.searchParams)).toEqual({
            head_sha: sha,
            branch: "master",
            event: "push",
            per_page: "1",
        });
    });

    test("rejects a missing CI run", async () => {
        stubRuns([]);

        await expect(
            verifyReleaseCi(repository, sha, "test-token")
        ).rejects.toThrow("Publication requires successful node.js.yml");
    });

    test.each([
        { head_sha: "b".repeat(40) },
        { head_branch: "feature" },
        { event: "pull_request" },
    ])("rejects unrelated successful CI: %o", async (override) => {
        stubRuns([{ ...successfulRun, ...override }]);

        await expect(
            verifyReleaseCi(repository, sha, "test-token")
        ).rejects.toThrow("Publication requires successful node.js.yml");
    });

    test.each([
        { status: "in_progress", conclusion: null },
        { status: "completed", conclusion: "failure" },
    ])("does not fall back to an older success: %o", async (override) => {
        // A newer run or rerun must pass even when an older result was green.
        stubRuns([{ ...successfulRun, ...override }, successfulRun]);

        await expect(
            verifyReleaseCi(repository, sha, "test-token")
        ).rejects.toThrow("Wait for CI to pass");
    });

    test("fails closed when GitHub cannot supply CI results", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(new globalThis.Response("", { status: 403 }))
        );

        await expect(
            verifyReleaseCi(repository, sha, "test-token")
        ).rejects.toThrow("GitHub returned HTTP 403");
    });
});
