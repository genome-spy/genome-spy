import { afterEach, expect, test, vi } from "vitest";
import formatter from "./changelog.mjs";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

test("places GitHub references and attribution after the complete entry", async () => {
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
                "<!-- category: feature -->\n\nReplace the old\nAPI; see #456.\n\nMigration:\n- Rename oldProperty to newProperty.",
        },
        "major",
        { repo: "example/project" }
    );

    expect(entry).toBe(
        "- Replace the old\n" +
            "  API; see [#456](https://github.com/example/project/issues/456).\n\n" +
            "  Migration:\n" +
            "  - Rename oldProperty to newProperty. " +
            "([#123](https://github.com/example/project/pull/123)) " +
            "[@contributor](https://github.com/contributor)"
    );
});

test("preserves paragraphs without adding whitespace when attribution is absent", async () => {
    const entry = await formatter.getReleaseLine(
        {
            id: "offline-fix",
            releases: [{ name: "@genome-spy/core", type: "patch" }],
            summary:
                "<!-- category: fix -->\n\nKeep wrapped\nnotes readable.\n\nPreserve paragraphs.",
        },
        "patch",
        { repo: "example/project" }
    );

    expect(entry).toBe(
        "- Keep wrapped\n  notes readable.\n\n  Preserve paragraphs."
    );
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
