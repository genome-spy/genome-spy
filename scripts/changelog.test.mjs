import { afterEach, expect, test, vi } from "vitest";
import formatter from "./changelog.mjs";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

test("formats prose before GitHub references and attribution while preserving migration text", async () => {
    // Stub the HTTP boundary while exercising the actual GitHub formatter and metadata client.
    vi.stubEnv("GITHUB_TOKEN", "fixture-token");
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
            globalThis.Response.json({
                data: {
                    repo__0: {
                        commit__abc1234: {
                            commitUrl:
                                "https://github.com/example/project/commit/abc1234",
                            associatedPullRequests: {
                                nodes: [
                                    {
                                        number: 123,
                                        url: "https://github.com/example/project/pull/123",
                                        mergedAt: "2026-10-17T12:00:00Z",
                                        author: {
                                            login: "contributor",
                                            url: "https://github.com/contributor",
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            })
        )
    );
    const entry = await formatter.getReleaseLine(
        {
            id: "new-api",
            commit: "abc1234",
            releases: [{ name: "@genome-spy/core", type: "major" }],
            summary:
                "<!-- category: feature -->\n\nReplace the old API.\n\nMigration: rename oldProperty to newProperty.",
        },
        "major",
        { repo: "example/project" }
    );

    expect(entry).toContain(
        "- Replace the old API. ([#123](https://github.com/example/project/pull/123)) [@contributor](https://github.com/contributor)"
    );
    expect(entry).toContain("Migration: rename oldProperty to newProperty.");
    expect(entry).not.toContain("category:");
});

test("retains dependency updates through the shared formatter", async () => {
    const entry = await formatter.getDependencyReleaseLine(
        [],
        [
            {
                name: "@genome-spy/core",
                type: "patch",
                oldVersion: "1.0.0",
                newVersion: "1.0.1",
                changesets: [],
                packageJson: { name: "@genome-spy/core", version: "1.0.1" },
                dir: "packages/core",
            },
        ],
        { repo: "example/project" }
    );

    expect(entry).toContain("Updated dependencies");
    expect(entry).toContain("@genome-spy/core@1.0.1");
});
