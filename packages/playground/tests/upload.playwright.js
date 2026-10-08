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
});
