// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import SaveImageDialog from "./saveImageDialog.js";

beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn();
});

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe("SaveImageDialog", () => {
    test("downloads a PNG using the raster export API", async () => {
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        const exportRaster = vi.fn(async () => ({
            blob: new Blob(["png"], { type: "image/png" }),
        }));
        const dialog = new SaveImageDialog();
        dialog.genomeSpy = /** @type {any} */ ({
            getLogicalCanvasSize: () => ({ width: 800, height: 600 }),
            exportRaster,
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
                logicalHeight: 600,
                pixelRatio: 2,
                background: "#ffffff",
                mimeType: "image/png",
            });
            expect(click).toHaveBeenCalledOnce();
            expect(document.querySelector("a[download]")).toBeNull();
        });
    });
});
