// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import SaveSvgDialog from "./saveSvgDialog.js";

beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn();
});

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("SaveSvgDialog", () => {
    test("enables rasterization controls only when requested", async () => {
        const dialog = createDialog();
        document.body.appendChild(dialog);
        await dialog.updateComplete;

        const rasterize = getInput(dialog, "svgRasterizeDenseMarks");
        const threshold = getInput(dialog, "svgMaxVectorInstances");
        const pixelRatio = getInput(dialog, "svgRasterPixelRatio");

        expect(threshold.disabled).toBe(true);
        expect(pixelRatio.disabled).toBe(true);

        rasterize.click();
        await dialog.updateComplete;

        expect(threshold.disabled).toBe(false);
        expect(pixelRatio.disabled).toBe(false);
        expect(dialog.getExportOptions()).toEqual({
            rasterization: {
                maxVectorInstances: 10_000,
                pixelRatio: 2,
            },
        });
    });

    test("passes rasterization options to SVG export", async () => {
        const blob = new Blob(["<svg/>"]);
        const write = vi.fn();
        const close = vi.fn();
        const showSaveFilePicker = vi.fn(async () => ({
            createWritable: async () => ({ write, close }),
        }));
        vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);

        const dialog = createDialog();
        dialog.rasterizeDenseMarks = true;
        dialog.maxVectorInstances = 2500;
        dialog.rasterPixelRatio = 3;
        const exportSvg = vi.mocked(dialog.genomeSpy.exportSvg);
        exportSvg.mockResolvedValue({ blob, warnings: [], rasterized: [] });
        document.body.appendChild(dialog);
        await dialog.updateComplete;

        const saveButton = /** @type {HTMLButtonElement} */ (
            dialog.renderRoot.querySelector("footer button[data-primary]")
        );
        saveButton.click();

        await vi.waitFor(() => {
            expect(exportSvg).toHaveBeenCalledWith({
                rasterization: {
                    maxVectorInstances: 2500,
                    pixelRatio: 3,
                },
            });
            expect(write).toHaveBeenCalledWith(blob);
            expect(close).toHaveBeenCalledOnce();
        });
    });

    test("downloads vector SVG without rasterization by default", async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const dialog = createDialog();
        const exportSvg = vi.mocked(dialog.genomeSpy.exportSvg);
        exportSvg.mockResolvedValue({
            blob: /** @type {Blob} */ (
                /** @type {unknown} */ ({ text: async () => "<svg/>" })
            ),
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
            expect(exportSvg).toHaveBeenCalledWith({});
            expect(click).toHaveBeenCalledOnce();
            expect(document.querySelector("a[download]")).toBeNull();
        });
    });
});

/** @returns {SaveSvgDialog} */
function createDialog() {
    const dialog = new SaveSvgDialog();
    dialog.genomeSpy = /** @type {any} */ ({
        getLogicalCanvasSize: () => ({ width: 800, height: 600 }),
        exportSvg: vi.fn(),
    });
    return dialog;
}

/**
 * @param {SaveSvgDialog} dialog
 * @param {string} id
 */
function getInput(dialog, id) {
    return /** @type {HTMLInputElement} */ (
        dialog.renderRoot.querySelector(`#${id}`)
    );
}
