import { test, expect } from "@playwright/test";

const exampleUrl = "/audit-example.json";
const spec = {
    description: "Catalog example",
    data: { values: [{ x: 1 }] },
    mark: "point",
    encoding: { x: { field: "x", type: "quantitative" } },
};

/** @param {import("@playwright/test").Page} page */
async function mockCatalogExample(page) {
    await page.route(`**${exampleUrl}`, (route) =>
        route.fulfill({ json: spec })
    );
    await page.route("**/example-catalog.json", (route) =>
        route.fulfill({
            json: [
                {
                    id: "audit-example",
                    title: spec.description,
                    description: spec.description,
                    category: "Test",
                    sourceLabel: "Core",
                    specUrl: exampleUrl,
                },
            ],
        })
    );
}

/** @param {import("@playwright/test").Page} page */
async function openCatalogExample(page) {
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await page.getByRole("button", { name: /Catalog example/ }).click();
}

test("cancels an earlier spec load when a newer example is selected", async ({
    page,
}) => {
    const slowUrl = "/audit-slow.json";
    const response = Promise.withResolvers();
    await page.route(`**${slowUrl}`, async (route) => {
        await response.promise;
        await route.fulfill({ json: { ...spec, description: "Slow spec" } });
    });
    await mockCatalogExample(page);

    const slowRequested = page.waitForRequest(`**${slowUrl}`);
    const slowCanceled = page.waitForEvent("requestfailed", {
        predicate: (request) => request.url().endsWith(slowUrl),
    });
    try {
        await page.goto(`/?spec=${slowUrl}&renderer=canvas`);
        await slowRequested;
        await openCatalogExample(page);
        await slowCanceled;

        await expect(page).toHaveURL(/spec=\/audit-example\.json/);
        await expect(page.locator("code-editor .cm-content")).toContainText(
            spec.description
        );
    } finally {
        response.resolve();
    }
});

test("shows a linked spec failure and opens the default spec", async ({
    page,
}) => {
    await page.route("**/audit-unavailable.json", (route) =>
        route.fulfill({ status: 404 })
    );
    await page.goto("/?spec=/audit-unavailable.json&renderer=canvas");

    await expect(page.locator("#editor-pane").getByRole("alert")).toContainText(
        "Could not load specification: 404"
    );
    await expect(page.locator("code-editor .cm-content")).toContainText(
        '"mark": "rect"'
    );
    await expect(page.locator("#genome-spy-container canvas")).toBeVisible();
});

test("handles the first edit after opening the same spec again", async ({
    page,
}) => {
    await mockCatalogExample(page);
    await page.goto(`/?spec=${exampleUrl}&renderer=canvas`);
    const editor = page.locator("code-editor .cm-content");
    await expect(editor).toContainText(spec.description);
    await expect(page.locator("#genome-spy-container canvas")).toBeVisible();

    const historyLength = await page.evaluate(() => globalThis.history.length);
    await openCatalogExample(page);
    await expect
        .poll(() => page.evaluate(() => globalThis.history.length))
        .toBe(historyLength + 1);

    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" ");
    await expect(page).not.toHaveURL(/spec=/);
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    JSON.parse(
                        globalThis.localStorage.getItem("playgroundSpec")
                    ).specText
            )
        )
        .toMatch(/ $/);
});
