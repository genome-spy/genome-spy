// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import ImageExportDialog from "./imageExportDialog.js";

beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
});

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe("ImageExportDialog", () => {
    test("previews rasterized layers without repeating the analysis", async () => {
        const dialog = createDialog();
        document.body.appendChild(dialog);

        await dialog.show();
        await dialog.updateComplete;

        expect(getPreviewText(dialog)).toContain(
            "2 layers containing 16,000 visible instances will be rasterized"
        );
        expect(getPreviewText(dialog)).toContain("Dense points (point, 6,000)");
        expect(getPreviewText(dialog)).toContain("heatmap (rect, 10,000)");

        const threshold = getInput(dialog, "maxVectorInstances");
        threshold.value = "9000";
        threshold.dispatchEvent(new InputEvent("input"));
        await dialog.updateComplete;

        expect(getPreviewText(dialog)).toContain(
            "1 layer containing 10,000 visible instances will be rasterized"
        );
        expect(dialog.api.imageExport.analyzeSvg).toHaveBeenCalledOnce();
    });

    test("exports SVG with the selected rasterization options", async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const dialog = createDialog();
        document.body.appendChild(dialog);
        await dialog.show();
        await dialog.updateComplete;

        getPrimaryButton(dialog).click();

        await vi.waitFor(() => {
            expect(dialog.api.imageExport.svg).toHaveBeenCalledWith({
                rasterization: {
                    maxVectorInstances: 5000,
                    pixelRatio: 2,
                },
            });
            expect(click).toHaveBeenCalledOnce();
            expect(document.querySelector("a[download]")).toBeNull();
        });
    });

    test("exports PNG with the selected scale factor", async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const dialog = createDialog();
        document.body.appendChild(dialog);
        await dialog.show();

        const png = /** @type {HTMLInputElement} */ (
            dialog.renderRoot.querySelector('input[value="png"]')
        );
        png.click();
        await dialog.updateComplete;

        const pixelRatio = getInput(dialog, "pngPixelRatio");
        pixelRatio.value = "3";
        pixelRatio.dispatchEvent(new InputEvent("input"));
        await dialog.updateComplete;
        getPrimaryButton(dialog).click();

        await vi.waitFor(() => {
            expect(dialog.api.imageExport.raster).toHaveBeenCalledWith({
                mimeType: "image/png",
                pixelRatio: 3,
            });
            expect(click).toHaveBeenCalledOnce();
        });
    });
});

/** @returns {ImageExportDialog} */
function createDialog() {
    const dialog = new ImageExportDialog();
    dialog.api = /** @type {any} */ ({
        imageExport: {
            analyzeSvg: vi.fn(async () => ({
                layers: [
                    {
                        viewName: "small",
                        viewPath: "viewRoot/small",
                        markType: "point",
                        instanceCount: 1000,
                    },
                    {
                        viewName: "points",
                        viewTitle: "Dense points",
                        viewPath: "viewRoot/points",
                        markType: "point",
                        instanceCount: 6000,
                    },
                    {
                        viewName: "heatmap",
                        viewPath: "viewRoot/heatmap",
                        markType: "rect",
                        instanceCount: 10000,
                    },
                ],
            })),
            svg: vi.fn(async () => ({
                blob: new Blob(["<svg/>"], { type: "image/svg+xml" }),
                warnings: [],
                rasterized: [],
            })),
            raster: vi.fn(async () => ({
                blob: new Blob(["png"], { type: "image/png" }),
            })),
        },
    });
    return dialog;
}

/**
 * @param {ImageExportDialog} dialog
 * @param {string} id
 */
function getInput(dialog, id) {
    return /** @type {HTMLInputElement} */ (
        dialog.renderRoot.querySelector(`#${id}`)
    );
}

/** @param {ImageExportDialog} dialog */
function getPrimaryButton(dialog) {
    return /** @type {HTMLButtonElement} */ (
        dialog.renderRoot.querySelector("button.primary")
    );
}

/** @param {ImageExportDialog} dialog */
function getPreviewText(dialog) {
    return dialog.renderRoot
        .querySelector(".preview")
        .textContent.replace(/\s+/g, " ")
        .trim();
}
