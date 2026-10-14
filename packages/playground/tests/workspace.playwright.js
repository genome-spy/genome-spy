import { test, expect } from "@playwright/test";

test("collapses Files without replacing the editor or visualization", async ({
    page,
}) => {
    await page.goto("/");
    const workspace = page.locator("gs-playground-workspace");
    const toggle = workspace.getByRole("button", {
        name: "Add data files",
        exact: true,
    });
    const fileRegion = workspace.getByRole("region", {
        name: "Files",
        exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(fileRegion).toBeHidden();
    await expect(workspace.getByRole("separator")).toBeHidden();

    await expect
        .poll(() =>
            page.evaluate(
                async () =>
                    !!(await import("/index.js")).getCurrentEmbedResult()
            )
        )
        .toBe(true);
    const editor = page.locator("code-editor");
    const original = await editor.evaluate((element) => {
        globalThis.dockEditor = element._editor;
        globalThis.dockFilePane =
            globalThis.document.querySelector("file-pane");
        return element.value;
    });
    await page.evaluate(async () => {
        globalThis.dockEmbed = (
            await import("/index.js")
        ).getCurrentEmbedResult();
    });
    await editor.evaluate((element) =>
        // Separate this edit from the initial document load in undo history.
        element._editor.dispatch({
            changes: { from: 0, insert: " " },
            userEvent: "input.paste",
        })
    );

    const closedWidth = (await editor.boundingBox()).width;
    await toggle.press("Enter");
    await expect(fileRegion).toBeVisible();
    await expect
        .poll(async () => (await editor.boundingBox()).width)
        .toBeLessThan(closedWidth - 200);

    const separator = workspace.getByRole("separator", {
        name: "Resize auxiliary panel",
    });
    await separator.focus();
    await separator.press("ArrowLeft");
    await expect
        .poll(() =>
            workspace.evaluate((element) => element.viewState.auxiliaryWidth)
        )
        .toBe(410);
    await toggle.press("Enter");
    await expect(toggle).toBeFocused();
    await expect(fileRegion).toBeHidden();
    await expect(workspace.getByRole("separator")).toBeHidden();
    await expect
        .poll(async () => (await editor.boundingBox()).width)
        .toBe(closedWidth);
    await expect(
        page.getByRole("button", { name: "Choose files" })
    ).toBeHidden();

    await toggle.click();
    await page
        .getByRole("button", { name: "Toggle layout", exact: true })
        .click();
    await expect(workspace.locator(".workspace")).toHaveClass(/bottom/);
    await expect
        .poll(async () => (await workspace.boundingBox()).height)
        .toBeGreaterThan(600);
    const bottomSeparator = workspace.getByRole("separator", {
        name: "Resize Files panel",
    });
    await bottomSeparator.focus();
    await bottomSeparator.press("ArrowUp");
    await expect
        .poll(() =>
            workspace.evaluate((element) => element.viewState.filesHeight)
        )
        .toBe(310);
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
    await expect(workspace).toBeHidden();
    await expect(page.locator("gs-inspector-panel")).toBeVisible();
    await page
        .getByRole("button", { name: "Close inspector", exact: true })
        .click();
    await expect(workspace).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page
        .getByRole("button", { name: "Toggle layout", exact: true })
        .click();
    await expect(workspace.locator(".workspace")).toHaveClass(/side/);
    await expect
        .poll(() =>
            workspace.evaluate((element) => element.viewState.auxiliaryWidth)
        )
        .toBe(410);

    await expect
        .poll(() =>
            page.evaluate(async () => {
                const editor = globalThis.document.querySelector("code-editor");
                return (
                    editor._editor === globalThis.dockEditor &&
                    globalThis.document.querySelector("file-pane") ===
                        globalThis.dockFilePane &&
                    (await import("/index.js")).getCurrentEmbedResult() ===
                        globalThis.dockEmbed
                );
            })
        )
        .toBe(true);
    await editor.locator(".cm-content").focus();
    await editor.locator(".cm-content").press("ControlOrMeta+z");
    await expect
        .poll(() => editor.evaluate((element) => element.value))
        .toBe(original);
});

test("keeps bindings active and bounded while Files and layout change", async ({
    page,
}) => {
    await page.goto(
        "/?spec=examples/core/techniques/input_element_binding.json"
    );
    const bindings = page.locator("#input-bindings-pane");
    const input = bindings.locator("input").first();
    await expect(input).toBeVisible();
    await input.fill("35");
    await input.dispatchEvent("input");
    await input.dispatchEvent("change");
    await expect(input).toHaveValue("35");
    await page.evaluate(() => {
        globalThis.dockBinding =
            globalThis.document.querySelector(".gs-input-bindings");
    });
    const workspace = page.locator("gs-playground-workspace");
    const toggle = workspace.getByRole("button", {
        name: "Add data files",
        exact: true,
    });
    for (let orientation = 0; orientation < 2; orientation++) {
        await toggle.click();
        await expect(input).toBeVisible();
        await expect(input).toHaveValue("35");
        const pane = await workspace.locator(".bindings").boundingBox();
        const files = await workspace
            .getByRole("region", { name: "Files" })
            .boundingBox();
        expect(pane.height).toBeGreaterThan(50);
        expect(files.height).toBeGreaterThan(80);
        await toggle.click();
        await expect(input).toBeVisible();
        await page
            .getByRole("button", { name: "Toggle layout", exact: true })
            .click();
    }
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
    await page
        .getByRole("button", { name: "Close inspector", exact: true })
        .click();
    await expect(input).toHaveValue("35");
    expect(
        await page.evaluate(
            () =>
                globalThis.document.querySelector(".gs-input-bindings") ===
                globalThis.dockBinding
        )
    ).toBe(true);

    const handle = workspace.getByRole("separator", {
        name: "Resize auxiliary panel",
    });
    const before = await workspace.evaluate(
        (element) => element.viewState.auxiliaryWidth
    );
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y + box.height / 2);
    await page.mouse.up();
    await expect
        .poll(() =>
            workspace.evaluate((element) => element.viewState.auxiliaryWidth)
        )
        .toBeGreaterThan(before + 35);

    await page.setViewportSize({ width: 480, height: 740 });
    await expect(workspace.locator(".workspace")).toHaveClass(/bottom/);
    await toggle.click();
    await expect(input).toBeVisible();
    await expect(toggle).toBeInViewport({ ratio: 1 });
    const editorBox = await page.locator("code-editor").boundingBox();
    const workspaceBox = await workspace.boundingBox();
    expect(editorBox.height).toBeLessThan(workspaceBox.height);
    expect(editorBox.height).toBeGreaterThan(40);
});

test("scrolls large binding sets without covering Files or the editor", async ({
    page,
}) => {
    const spec = {
        params: [
            ...Array.from({ length: 30 }, (_, index) => ({
                name: "parameter" + index,
                value: 50,
                bind: {
                    input: "range",
                    min: 0,
                    max: 100,
                    name:
                        index === 0
                            ? "A descriptive parameter label that needs to wrap"
                            : "Parameter " + index,
                },
            })),
            {
                name: "choice",
                value: "first",
                bind: {
                    input: "select",
                    options: ["first", "second"],
                    labels: [
                        "A long descriptive option that should stay inside its control",
                        "Second option",
                    ],
                },
            },
            { name: "caption", value: "Example", bind: { input: "text" } },
            {
                name: "mode",
                value: "first",
                bind: {
                    input: "radio",
                    options: ["first", "second"],
                    labels: [
                        "First descriptive choice",
                        "Second descriptive choice",
                    ],
                },
            },
        ],
        data: { values: [{ x: 1, y: 1 }] },
        mark: "point",
        encoding: {
            x: { field: "x", type: "quantitative" },
            y: { field: "y", type: "quantitative" },
        },
    };
    await page.addInitScript(
        (specText) =>
            globalThis.localStorage.setItem(
                "playgroundSpec",
                JSON.stringify({ specText })
            ),
        JSON.stringify(spec)
    );
    await page.goto("/");
    const workspace = page.locator("gs-playground-workspace");
    const toggle = workspace.getByRole("button", {
        name: "Add data files",
        exact: true,
    });
    const sliders = page.locator("#input-bindings-pane").getByRole("slider");
    await expect(sliders).toHaveCount(30);
    await toggle.click();

    for (const width of [1280, 480, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await expect(toggle).toBeInViewport({ ratio: 1 });
        await expect
            .poll(() =>
                workspace
                    .locator(".bindings")
                    .evaluate(
                        (element) => element.scrollHeight > element.clientHeight
                    )
            )
            .toBe(true);
        const overflow = await workspace
            .locator(".bindings")
            .evaluate((element) => element.scrollWidth - element.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        const editor = await page.locator("code-editor").boundingBox();
        expect(editor.height).toBeGreaterThan(60);
        const files = await workspace
            .getByRole("region", { name: "Files" })
            .boundingBox();
        expect(files.height).toBeGreaterThan(80);
    }
    await sliders.last().scrollIntoViewIfNeeded();
    await sliders.last().fill("60");
    await expect(sliders.last()).toHaveValue("60");
    await expect(toggle).toBeInViewport({ ratio: 1 });

    // The gallery must cover the dock controls as well as the main split handle.
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await expect(
        page.getByRole("searchbox", { name: "Search examples" })
    ).toBeVisible();
    await expect
        .poll(() =>
            workspace.evaluate((element) => {
                const picker =
                    globalThis.document.querySelector("gs-example-picker");
                return Array.from(
                    element.shadowRoot.querySelectorAll(".rail,.resize-handle")
                )
                    .filter((element) => !element.hidden)
                    .every((element) => {
                        const rect = element.getBoundingClientRect();
                        return (
                            globalThis.document.elementFromPoint(
                                rect.x + rect.width / 2,
                                rect.y + rect.height / 2
                            ) === picker
                        );
                    });
            })
        )
        .toBe(true);
});

test("lets the Files dock grow beyond half the workspace while keeping tools usable", async ({
    page,
}) => {
    await page.goto(
        "/?spec=examples/core/techniques/input_element_binding.json"
    );
    const workspace = page.locator("gs-playground-workspace");
    const sliders = page.locator("#input-bindings-pane").getByRole("slider");
    await expect(sliders.first()).toBeVisible();
    const toggle = workspace.getByRole("button", {
        name: "Add data files",
        exact: true,
    });
    await toggle.click();

    for (const bottom of [false, true]) {
        const separator = workspace.getByRole("separator");
        const handle = await separator.boundingBox();
        const bounds = await workspace.boundingBox();
        const x = handle.x + handle.width / 2;
        const y = handle.y + handle.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(
            bottom ? x : bounds.x + 1,
            bottom ? bounds.y + 1 : y
        );
        await page.mouse.up();

        const dimension = bottom ? "height" : "width";
        await expect
            .poll(
                async () =>
                    (await workspace.locator(".editor").boundingBox())[
                        dimension
                    ]
            )
            .toBeLessThan(bounds[dimension] / 2);
        const editor = await workspace.locator(".editor").boundingBox();
        const files = await workspace
            .getByRole("region", { name: "Files", exact: true })
            .boundingBox();
        expect(editor[dimension]).toBeGreaterThanOrEqual(119);
        expect(files[dimension]).toBeGreaterThan(bounds[dimension] / 2);
        await expect(toggle).toBeInViewport({ ratio: 1 });

        if (bottom) {
            const bindings = await workspace.locator(".bindings").boundingBox();
            expect(bindings.height).toBeGreaterThanOrEqual(60);
            await sliders.last().scrollIntoViewIfNeeded();
            await sliders.last().fill("30");
            await expect(sliders.last()).toHaveValue("30");
        } else {
            await page
                .getByRole("button", { name: "Toggle layout", exact: true })
                .click();
            await expect(workspace.locator(".workspace")).toHaveClass(/bottom/);
        }
    }
});
