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

    const uploadedFileTab = page.locator(
        'file-pane li[data-name="uploaded-points.csv"]'
    );
    await expect(uploadedFileTab).toHaveClass(/selected/);
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
});
