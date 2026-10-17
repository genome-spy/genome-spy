import { expect, test } from "vitest";
import { resolveOverlayExtent } from "./overlayExtent.js";

test("falls back to view extent for auto when projections differ", () => {
    expect(
        resolveOverlayExtent({
            extent: "auto",
            ownerSpec: { vconcat: [] },
            channels: ["x"],
            isAligned: () => false,
            label: "Overlay",
        })
    ).toBe("view");
});
