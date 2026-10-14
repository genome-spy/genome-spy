import { afterEach, beforeEach, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import { generateExampleCatalog } from "./exampleCatalog.mjs";

/** @type {string} */
let root;
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "playground-catalog-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** @param {Record<string, string>} files */
function writeFixture(files) {
    for (const [file, content] of Object.entries(files)) {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
}

/** @param {string} specUrlRoot */
function catalog(specUrlRoot = "/examples") {
    return generateExampleCatalog(
        path.join(root, "examples"),
        specUrlRoot,
        path.join(root, "docs")
    );
}

test("indexes all embedding pages once, with titles and published routes", () => {
    writeFixture({
        "examples/docs/shared.json":
            '{"description":"Shared example","mark":"point"}',
        "examples/core/unreferenced.json": '{"mark":"point"}',
        "docs/index.md":
            '# Home\nEXAMPLE "examples/docs/shared.json" height=200 spechidden\nEXAMPLE examples/docs/shared.json',
        "docs/grammar/index.md":
            "---\ntitle: SEO title\n---\n# Grammar #\nEXAMPLE 'examples/docs/shared.json'",
        "docs/grammar/details.md":
            '---\ntitle: "Details"\n---\nEXAMPLE examples/docs/shared.json',
        "docs/grammar/fenced.md": [
            "````markdown",
            "# Code heading",
            "```",
            "EXAMPLE examples/docs/missing.json",
            "````",
            "~~~text",
            "EXAMPLE examples/docs/missing.json",
            "~~~",
            "EXAMPLE_GALLERY examples/docs",
            "- [Shared](details.md) shared.json",
        ].join("\n"),
        "docs/example-specs/generated.md": "EXAMPLE examples/docs/missing.json",
    });

    const entries = catalog();
    expect(
        entries.find((entry) => entry.id === "docs/shared").documentation
    ).toEqual([
        {
            title: "Details",
            url: "https://genomespy.app/docs/grammar/details/",
        },
        {
            title: "Grammar",
            url: "https://genomespy.app/docs/grammar/",
        },
        { title: "Home", url: "https://genomespy.app/docs/" },
    ]);
    expect(
        entries.find((entry) => entry.id === "core/unreferenced").documentation
    ).toEqual([]);
    // Public asset roots change, but example identity and references do not.
    const published = catalog("/docs/example-specs");
    expect(published[0].specUrl).toBe("/docs/example-specs/docs/shared.json");
    expect(published[0].documentation).toEqual(entries[0].documentation);
});

test("rejects broken example references with the consuming page", () => {
    writeFixture({
        "examples/docs/shared.json": '{"mark":"point"}',
        "docs/broken.md": "# Broken\nEXAMPLE examples/docs/missing.json",
    });
    expect(() => catalog()).toThrow(
        "Unknown EXAMPLE in broken.md: examples/docs/missing.json"
    );
});

test("targets the nearest section with formatted, repeated, and explicit heading IDs", () => {
    const names = [
        "top",
        "formatted",
        "first",
        "second",
        "explicit",
        "reserved",
    ];
    writeFixture({
        ...Object.fromEntries(
            names.map((name) => [
                "examples/docs/" + name + ".json",
                '{"mark":"point"}',
            ])
        ),
        "docs/sections.md": [
            "# Repeat",
            "EXAMPLE examples/docs/top.json",
            "## Résumé `values` & scales",
            "EXAMPLE examples/docs/formatted.json",
            "## Repeat",
            "EXAMPLE examples/docs/first.json",
            "```markdown",
            "## Repeat",
            "```",
            "## Repeat",
            "EXAMPLE examples/docs/second.json",
            "## Custom { #kept-id }",
            "EXAMPLE examples/docs/explicit.json",
            "## Later",
            "EXAMPLE examples/docs/reserved.json",
            "## Custom { #later }",
            "EXAMPLE examples/docs/formatted.json",
        ].join("\n"),
    });

    const entries = catalog();
    const hashes = new Map(
        entries.map((entry) => [
            entry.id,
            entry.documentation.map(({ url }) => new URL(url).hash),
        ])
    );
    expect(hashes.get("docs/top")).toEqual([""]);
    expect(hashes.get("docs/formatted")).toEqual(["#resume-values-scales"]);
    expect(hashes.get("docs/first")).toEqual(["#repeat_1"]);
    expect(hashes.get("docs/second")).toEqual(["#repeat_2"]);
    expect(hashes.get("docs/explicit")).toEqual(["#kept-id"]);
    expect(hashes.get("docs/reserved")).toEqual(["#later_1"]);
});
