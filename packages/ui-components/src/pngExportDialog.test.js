// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import PngExportDialog from "./pngExportDialog.js";
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
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe("PngExportDialog", () => {
    test("downloads a PNG using the raster export API", async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const exportRaster = vi.fn(async () => ({
            blob: new Blob(["png"], { type: "image/png" }),
        }));
        const dialog = new PngExportDialog();
        dialog.source = /** @type {any} */ ({
            getLogicalCanvasSize: () => ({ width: 799, height: 601 }),
            imageExport: { raster: exportRaster },
        });
        document.body.appendChild(dialog);
        await dialog.updateComplete;

        const saveButton = /** @type {HTMLButtonElement} */ (
            dialog.renderRoot.querySelector("footer button[data-primary]")
        );
        saveButton.click();

        await vi.waitFor(() => {
            expect(exportRaster).toHaveBeenCalledWith({
                logicalWidth: 800,
                logicalHeight: 602,
                pixelRatio: 2,
                background: "#ffffff",
                mimeType: "image/png",
            });
            expect(click).toHaveBeenCalledOnce();
            expect(document.querySelector("a[download]")).toBeNull();
        });
    });

    test("ignores a pending download after the visualization is replaced", async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => {});
        const dialog = new PngExportDialog();
        dialog.openOnConnect = false;
        dialog.backgroundMode = "visualization";
        dialog.roundDimensions = false;
        /** @type {PromiseWithResolvers<{blob: Blob}>} */
        const pendingExport = Promise.withResolvers();
        const raster = vi.fn(() => pendingExport.promise);
        dialog.source = {
            getLogicalCanvasSize: () => ({ width: 799, height: 601 }),
            imageExport: { raster },
        };
        document.body.append(dialog);

        await dialog.show();
        const saveButton = /** @type {HTMLButtonElement} */ (
            dialog.renderRoot.querySelector("footer button[data-primary]")
        );
        saveButton.click();
        expect(raster).toHaveBeenCalledWith({
            logicalWidth: 799,
            logicalHeight: 601,
            pixelRatio: 2,
            mimeType: "image/png",
        });

        dialog.source = {
            getLogicalCanvasSize: () => ({ width: 640, height: 480 }),
            imageExport: { raster },
        };
        await dialog.updateComplete;
        await dialog.show();

        pendingExport.resolve({
            blob: new Blob(["png"], { type: "image/png" }),
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(click).not.toHaveBeenCalled();
        expect(dialog.renderRoot.querySelector("dialog").open).toBe(true);
    });
});
