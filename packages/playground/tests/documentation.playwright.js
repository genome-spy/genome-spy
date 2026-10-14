import { test, expect } from "@playwright/test";

const syntenyPath = "docs/grammar/mark/rule/synteny-hg38-mm10.json";

test("keeps documentation references through editing, reload, and example selection", async ({
    page,
}, testInfo) => {
    // The published asset root is also served in development for docs links.
    await page.goto("/?spec=/docs/example-specs/" + syntenyPath);
    const documentation = page.getByRole("navigation", {
        name: "Example documentation",
    });
    await expect(documentation.getByRole("link")).toHaveText([
        "Genomic Coordinates",
        "Rule",
        "Scales",
    ]);
    await expect(
        documentation.getByRole("link", { name: "Rule", exact: true })
    ).toHaveAttribute(
        "href",
        "https://genomespy.app/docs/grammar/mark/rule/#human-mouse-synteny"
    );
    await expect(documentation.getByRole("link").first()).toHaveAttribute(
        "target",
        "_blank"
    );
    await expect(page.locator("base-url-notice")).toHaveCount(0);

    // Exercise the actual data URL resolution after removing the base URL UI.
    await expect
        .poll(() =>
            page.evaluate(async () => {
                const api = (await import("/index.js")).getCurrentEmbedResult();
                return (
                    api &&
                    api.dataLoading
                        .getSnapshot()
                        .every((entry) => entry.status === "complete")
                );
            })
        )
        .toBe(true);

    await expect(
        page.locator("#genome-spy-container .loading-indicators")
    ).toBeHidden();
    await page.screenshot({
        path: testInfo.outputPath("documentation-links.png"),
    });

    const editor = page.locator("code-editor .cm-content");
    await editor.focus();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" ");
    await expect(page).not.toHaveURL(/spec=/);
    await expect
        .poll(() =>
            page.evaluate(() =>
                JSON.parse(
                    globalThis.localStorage.getItem("playgroundSpec")
                ).specText.endsWith(" ")
            )
        )
        .toBe(true);
    await page.reload();
    await expect(documentation.getByRole("link")).toHaveCount(3);

    await page.setViewportSize({ width: 320, height: 740 });
    const rule = documentation.getByRole("link", { name: "Rule", exact: true });
    await rule.focus();
    await expect(rule).toBeFocused();
    await expect(rule).toBeInViewport({ ratio: 1 });
    expect(
        await documentation.evaluate(
            (element) => element.scrollWidth - element.clientWidth
        )
    ).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 1280, height: 740 });
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await page
        .getByRole("searchbox", { name: "Search examples" })
        .fill("Human-mouse synteny example");
    await page
        .getByRole("button", { name: /Human-mouse synteny example/ })
        .click();
    await expect(page).toHaveURL(/spec=\/examples\//);
    await expect(documentation.getByRole("link")).toHaveCount(3);

    // Another source replaces the references instead of retaining the old bar.
    await page.goto(
        "/?spec=/examples/core/techniques/input_element_binding.json"
    );
    await expect(page.locator("code-editor .cm-content")).toContainText(
        "params"
    );
    await expect(documentation).toHaveCount(0);
    await page.reload();
    await expect(documentation).toHaveCount(0);
});

test("keeps the editor usable when documentation metadata cannot load", async ({
    page,
}) => {
    await page.route("**/example-catalog.json", (route) =>
        route.fulfill({ status: 503 })
    );
    await page.goto("/?spec=/examples/" + syntenyPath);
    await expect(page.locator("code-editor .cm-content")).toContainText(
        "Human-mouse synteny"
    );
    await expect(
        page.getByRole("navigation", { name: "Example documentation" })
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await expect(page.locator("gs-example-picker")).toContainText(
        "Could not load example catalog: 503"
    );
});

test("does not attribute external URLs or old saved specs to a curated example", async ({
    page,
}) => {
    const spec = {
        description: "External example",
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: { x: { field: "x", type: "quantitative" } },
    };
    await page.route("https://example.org/examples/**", (route) =>
        route.fulfill({ json: spec })
    );
    await page.goto("/?spec=https://example.org/examples/" + syntenyPath);
    await expect(page.locator("code-editor .cm-content")).toContainText(
        "External example"
    );
    await expect(
        page.getByRole("navigation", { name: "Example documentation" })
    ).toHaveCount(0);

    await page.evaluate(
        (spec) =>
            globalThis.localStorage.setItem(
                "playgroundSpec",
                JSON.stringify({ specText: JSON.stringify(spec) })
            ),
        spec
    );
    await page.goto("/");
    await expect(page.locator("code-editor .cm-content")).toContainText(
        "External example"
    );
    await expect(
        page.getByRole("navigation", { name: "Example documentation" })
    ).toHaveCount(0);
});
