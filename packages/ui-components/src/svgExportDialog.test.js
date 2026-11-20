// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import SvgExportDialog from "./svgExportDialog.js";
import "./define/imageExportDialog.js";

beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new Event("close"));
    };
    HTMLDialogElement.prototype.getAnimations = () => [];
});

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("SvgExportDialog", () => {
    test("enables rasterization by default and allows disabling it", async () => {
        const dialog = createDialog();
        document.body.appendChild(dialog);
        await dialog.updateComplete;

        const rasterize = getInput(dialog, "svgRasterizeDenseMarks");
        const threshold = getInput(dialog, "svgMaxVectorInstances");
        const pixelRatio = getInput(dialog, "svgRasterPixelRatio");

        expect(rasterize.checked).toBe(true);
        expect(threshold.disabled).toBe(false);
        expect(pixelRatio.disabled).toBe(false);
        expect(dialog.getExportOptions()).toEqual({
            logicalWidth: 800,
            logicalHeight: 600,
            rasterization: {
                maxVectorInstances: 5_000,
                pixelRatio: 2,
            },
        });

        rasterize.click();
        await dialog.updateComplete;

        expect(threshold.disabled).toBe(true);
        expect(pixelRatio.disabled).toBe(true);
        expect(dialog.getExportOptions()).toEqual({
            logicalWidth: 800,
            logicalHeight: 600,
        });
    });

    test("passes rasterization options to SVG export", async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const blob = new Blob(["<svg/>"], { type: "image/svg+xml" });

        const dialog = createDialog();
        dialog.rasterizeDenseMarks = true;
        dialog.maxVectorInstances = 2500;
        dialog.rasterPixelRatio = 3;
        const exportSvg = vi.mocked(dialog.source.imageExport.svg);
        exportSvg.mockResolvedValue({ blob, warnings: [], rasterized: [] });
        document.body.appendChild(dialog);
        await dialog.updateComplete;

        const saveButton = /** @type {HTMLButtonElement} */ (
            dialog.renderRoot.querySelector("footer button[data-primary]")
        );
        saveButton.click();

        await vi.waitFor(() => {
            expect(exportSvg).toHaveBeenCalledWith({
                logicalWidth: 800,
                logicalHeight: 600,
                rasterization: {
                    maxVectorInstances: 2500,
                    pixelRatio: 3,
                },
            });
            expect(click).toHaveBeenCalledOnce();
            expect(document.querySelector("a[download]")).toBeNull();
        });
    });

    test("downloads vector SVG when rasterization is disabled", async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const dialog = createDialog();
        dialog.rasterizeDenseMarks = false;
        const exportSvg = vi.mocked(dialog.source.imageExport.svg);
        exportSvg.mockResolvedValue({
            blob: new Blob(["<svg/>"], { type: "image/svg+xml" }),
            warnings: [],
            rasterized: [],
        });
        document.body.appendChild(dialog);
        await dialog.updateComplete;

        const saveButton = /** @type {HTMLButtonElement} */ (
            dialog.renderRoot.querySelector("footer button[data-primary]")
        );
        saveButton.click();

        await vi.waitFor(() => {
            expect(exportSvg).toHaveBeenCalledWith({
                logicalWidth: 800,
                logicalHeight: 600,
            });
            expect(click).toHaveBeenCalledOnce();
            expect(document.querySelector("a[download]")).toBeNull();
        });
    });

    test("debounces preview updates without reanalyzing", async () => {
        const dialog = createDialog();
        const analyzeSvgExport = vi.mocked(
            dialog.source.imageExport.analyzeSvg
        );
        analyzeSvgExport.mockResolvedValue({
            layers: [
                createLayer("small", "point", 5_000),
                createLayer("medium", "rect", 5_001),
                createLayer("large", "point", 12_000, "Large points"),
            ],
        });
        document.body.appendChild(dialog);

        await vi.waitFor(() => {
            expect(getPreviewText(dialog)).toContain(
                "2 layers will be rasterized"
            );
            expect(getPreviewText(dialog)).toContain("medium");
            expect(getPreviewText(dialog)).toContain("Large points");
        });

        vi.useFakeTimers();

        const threshold = getInput(dialog, "svgMaxVectorInstances");
        threshold.value = "8000";
        threshold.dispatchEvent(new Event("input", { bubbles: true }));
        await dialog.updateComplete;

        expect(dialog.getExportOptions()).toEqual({
            logicalWidth: 800,
            logicalHeight: 600,
            rasterization: {
                maxVectorInstances: 8_000,
                pixelRatio: 2,
            },
        });
        expect(getPreviewText(dialog)).toContain("2 layers will be rasterized");

        vi.advanceTimersByTime(499);
        await dialog.updateComplete;
        expect(getPreviewText(dialog)).toContain("2 layers will be rasterized");

        threshold.value = "10000";
        threshold.dispatchEvent(new Event("input", { bubbles: true }));
        await dialog.updateComplete;

        vi.advanceTimersByTime(1);
        await dialog.updateComplete;
        expect(getPreviewText(dialog)).toContain("2 layers will be rasterized");

        vi.advanceTimersByTime(499);
        await dialog.updateComplete;
        expect(getPreviewText(dialog)).toContain("1 layer will be rasterized");
        expect(getPreviewText(dialog)).not.toContain("medium");
        expect(analyzeSvgExport).toHaveBeenCalledOnce();
        expect(analyzeSvgExport).toHaveBeenCalledWith({
            logicalWidth: 800,
            logicalHeight: 600,
        });
    });

    test("updates dimensions when the canvas container is resized", async () => {
        let notifyResize = () => undefined;
        const disconnect = vi.fn();
        vi.stubGlobal(
            "ResizeObserver",
            class {
                /** @param {ResizeObserverCallback} callback */
                constructor(callback) {
                    notifyResize = () => callback([], this);
                }

                observe() {}

                disconnect() {
                    disconnect();
                }
            }
        );

        let size = { width: 800, height: 600 };
        const dialog = createDialog();
        dialog.source.getLogicalCanvasSize = () => size;
        dialog.resizeTarget = document.createElement("div");
        const analyzeSvgExport = vi.mocked(
            dialog.source.imageExport.analyzeSvg
        );
        document.body.appendChild(dialog);

        await vi.waitFor(() => {
            expect(analyzeSvgExport).toHaveBeenCalledOnce();
        });
        vi.useFakeTimers();

        size = { width: 1024.4, height: 767.6 };
        notifyResize();
        await dialog.updateComplete;

        expect(getInput(dialog, "svgDimensions").value).toBe("1024 x 768");
        expect(analyzeSvgExport).toHaveBeenCalledOnce();

        vi.advanceTimersByTime(500);
        await Promise.resolve();
        expect(analyzeSvgExport).toHaveBeenLastCalledWith({
            logicalWidth: 1024,
            logicalHeight: 768,
        });

        dialog.remove();
        expect(disconnect).toHaveBeenCalledOnce();
    });
});

/** @returns {SvgExportDialog} */
function createDialog() {
    const dialog = new SvgExportDialog();
    dialog.source = /** @type {any} */ ({
        getLogicalCanvasSize: () => ({ width: 800, height: 600 }),
        imageExport: {
            svg: vi.fn(),
            analyzeSvg: vi.fn().mockResolvedValue({ layers: [] }),
        },
    });
    return dialog;
}

/**
 * @param {SvgExportDialog} dialog
 * @param {string} id
 */
function getInput(dialog, id) {
    return /** @type {HTMLInputElement} */ (
        dialog.renderRoot.querySelector(`#${id}`)
    );
}

/** @param {SvgExportDialog} dialog */
function getPreviewText(dialog) {
    return dialog.renderRoot
        .querySelector(".raster-preview")
        .textContent.replace(/\s+/g, " ")
        .trim();
}

/**
 * @param {string} viewName
 * @param {string} markType
 * @param {number} instanceCount
 * @param {string} [viewTitle]
 * @returns {import("./imageExportSupport.js").SvgExportLayer}
 */
function createLayer(viewName, markType, instanceCount, viewTitle) {
    return {
        viewTitle,
        viewPath: `viewRoot/${viewName}`,
        markType,
        instanceCount,
    };
}
