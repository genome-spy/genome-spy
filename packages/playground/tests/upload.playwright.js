import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures",
    "uploaded-points.csv"
);

const uploadedFileSpec = JSON.stringify({
    data: { name: "uploaded-points.csv" },
    mark: { type: "point", size: 1000, color: "#ff0000" },
    encoding: {
        x: {
            field: "x",
            type: "quantitative",
            scale: { domain: [0, 10] },
            axis: null,
        },
        y: {
            field: "y",
            type: "quantitative",
            scale: { domain: [0, 10] },
            axis: null,
        },
    },
});

test("uses an uploaded file in a visualization", async ({ page }) => {
    await page.addInitScript((specText) => {
        globalThis.localStorage.setItem(
            "playgroundSpec",
            JSON.stringify({ specText })
        );
    }, uploadedFileSpec);

    await page.goto("/");

    await expect(page.locator(".missing-files")).toContainText(
        "uploaded-points.csv"
    );

    const filesToggle = page
        .locator("gs-playground-workspace")
        .getByRole("button", { name: /^Add data files/ });
    await expect(filesToggle).toHaveAttribute("aria-expanded", "true");
    await page.locator("#fileInput").setInputFiles(fixturePath);

    const uploadedFileTab = page.getByRole("tab", {
        name: "uploaded-points.csv",
    });
    await expect(uploadedFileTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("file-pane table")).toContainText(
        "Uploaded point"
    );

    await expect
        .poll(() =>
            page.evaluate(async () => {
                const { getCurrentEmbedResult } = await import("/index.js");
                const api = getCurrentEmbedResult();
                const root = api?.debug.getViewRoot();
                if (!root) {
                    return false;
                }

                const { createDataflowDebugSnapshot } =
                    await api.debug.getModules();
                const ids = new WeakMap();
                let nextId = 0;
                const snapshot = createDataflowDebugSnapshot(
                    root.context.dataFlow,
                    {
                        rootView: root,
                        getDebugId: (object) => {
                            if (!ids.has(object)) {
                                ids.set(object, String(nextId++));
                            }
                            return ids.get(object);
                        },
                    }
                );

                return snapshot.nodes.some(
                    (node) => node.first?.label === "Uploaded point"
                );
            })
        )
        .toBe(true);

    // The component's tabs support keyboard selection across its shadow root.
    await uploadedFileTab.focus();
    await uploadedFileTab.press("End");
    const addFiles = page.getByRole("tab", { name: "Add new files" });
    await expect(addFiles).toBeFocused();
    await expect(
        page.getByRole("button", { name: "Choose files" })
    ).toBeVisible();
    await addFiles.press("ArrowRight");
    await expect(uploadedFileTab).toBeFocused();
    await expect(uploadedFileTab).toHaveAttribute("aria-selected", "true");

    await filesToggle.click();
    await expect(uploadedFileTab).toBeHidden();
    await filesToggle.click();
    await expect(uploadedFileTab).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
    await page
        .getByRole("button", { name: "Close inspector", exact: true })
        .click();
    await expect(uploadedFileTab).toHaveAttribute("aria-selected", "true");

    // Inspect the composited frame after dataflow publication and rendering.
    await expect
        .poll(async () => {
            const screenshot = await page
                .locator("#genome-spy-container")
                .screenshot();
            return page.evaluate(
                async (dataUrl) => {
                    const image = new globalThis.Image();
                    image.src = dataUrl;
                    await image.decode();

                    const canvas = globalThis.document.createElement("canvas");
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const context = canvas.getContext("2d");
                    context.drawImage(image, 0, 0);
                    const pixels = context.getImageData(
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    ).data;

                    for (let index = 0; index < pixels.length; index += 4) {
                        if (
                            pixels[index] > 160 &&
                            pixels[index + 1] < 80 &&
                            pixels[index + 2] < 80
                        ) {
                            return true;
                        }
                    }
                    return false;
                },
                "data:image/png;base64," + screenshot.toString("base64")
            );
        })
        .toBe(true);

    // Newly missing data reveals the upload tab; further edits respect a manual collapse.
    await filesToggle.click();
    await page.locator("code-editor").evaluate((element) => {
        const spec = JSON.parse(element.value);
        spec.data.name = "next-file.csv";
        element.value = JSON.stringify(spec);
    });
    await expect(page.locator(".missing-files")).toContainText("next-file.csv");
    await expect(filesToggle).toHaveAttribute("aria-expanded", "true");
    await filesToggle.click();
    await page.locator("code-editor").evaluate((element) => {
        const spec = JSON.parse(element.value);
        spec.description = "Still waiting for the same file";
        element.value = JSON.stringify(spec);
    });
    await expect(
        page.getByText("Still waiting for the same file", { exact: true })
    ).toBeVisible();
    await expect(filesToggle).toHaveAttribute("aria-expanded", "false");

    // Ordinary edits preserve the preview, but loading another spec reveals its missing data.
    await filesToggle.click();
    await uploadedFileTab.click();
    await page.locator("code-editor").evaluate((element) => {
        const spec = JSON.parse(element.value);
        spec.description = "Editing while previewing an uploaded dataset";
        element.value = JSON.stringify(spec);
    });
    await expect(
        page.getByText("Editing while previewing an uploaded dataset", {
            exact: true,
        })
    ).toBeVisible();
    await expect(uploadedFileTab).toHaveAttribute("aria-selected", "true");
    await filesToggle.click();

    const entry = {
        id: "core/same-missing-file",
        title: "Another example requiring the same missing file",
        description: "Another example requiring the same missing file",
        sourceGroup: "core",
        sourceLabel: "Core",
        category: "Tests",
        specPath: "examples/core/same-missing-file.json",
        specUrl: "examples/core/same-missing-file.json",
        screenshotPath: null,
        screenshotUrl: null,
        sourceMode: "shared-example",
    };
    await page.route("**/example-catalog.json", (route) =>
        route.fulfill({ json: [entry] })
    );
    await page.route("**/examples/core/same-missing-file.json", (route) =>
        route.fulfill({
            json: {
                ...JSON.parse(uploadedFileSpec),
                description: entry.title,
                data: { name: "next-file.csv" },
            },
        })
    );
    await page.getByRole("button", { name: "Examples", exact: true }).click();
    await page.getByRole("button", { name: entry.title }).click();

    await expect(filesToggle).toHaveAttribute("aria-expanded", "true");
    await expect(addFiles).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".missing-files")).toContainText("next-file.csv");
    await expect(
        page.getByRole("button", { name: "Choose files" })
    ).toBeVisible();
});
