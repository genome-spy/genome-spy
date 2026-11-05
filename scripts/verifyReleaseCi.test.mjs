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

/** @param {Record<string, unknown>[][]} results */
function stubRuns(...results) {
    const fetch = vi.fn();
    for (const runs of results) {
        fetch.mockResolvedValueOnce(
            new globalThis.Response(JSON.stringify({ workflow_runs: runs }))
        );
    }
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

describe("release CI prerequisite", () => {
    test("requires both workflow runs for the exact master-push commit", async () => {
        const fetch = stubRuns([successfulRun], [successfulRun]);

        await verifyReleaseCi(repository, sha, "test-token");

        const urls = fetch.mock.calls.map(([url]) => new globalThis.URL(url));
        expect(urls.map((url) => url.pathname.split("/").at(-2))).toEqual([
            "node.js.yml",
            "changesets.yml",
        ]);
        for (const url of urls) {
            expect(Object.fromEntries(url.searchParams)).toMatchObject({
                head_sha: sha,
                branch: "master",
                event: "push",
            });
        }
    });

    test("rejects a missing second workflow", async () => {
        stubRuns([successfulRun], []);

        await expect(
            verifyReleaseCi(repository, sha, "test-token")
        ).rejects.toThrow("changesets.yml");
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
