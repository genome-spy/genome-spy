import { describe, expect, test } from "vitest";

import { exportRaster } from "./canvasExport.js";

describe("exportRaster", () => {
    test("rejects raster formats that are not yet supported", async () => {
        await expect(
            exportRaster({
                glHelper: /** @type {any} */ ({}),
                viewRoot: /** @type {any} */ ({}),
                mimeType: /** @type {any} */ ("image/webp"),
            })
        ).rejects.toThrow("Unsupported raster export MIME type: image/webp");
    });
});
