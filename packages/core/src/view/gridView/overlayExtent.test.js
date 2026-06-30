import { describe, expect, test } from "vitest";
import { resolveOverlayExtent } from "./overlayExtent.js";

describe("resolveOverlayExtent", () => {
    test("keeps explicit view extent per-view", () => {
        expect(
            resolveOverlayExtent({
                extent: "view",
                ownerSpec: { vconcat: [] },
                channels: ["x"],
                isAligned: () => true,
                label: "Overlay",
            })
        ).toBe("view");
    });

    test("uses container extent for aligned concat overlays", () => {
        expect(
            resolveOverlayExtent({
                extent: "auto",
                ownerSpec: { vconcat: [] },
                channels: ["x"],
                isAligned: () => true,
                label: "Overlay",
            })
        ).toBe("container");

        expect(
            resolveOverlayExtent({
                extent: "container",
                ownerSpec: { hconcat: [] },
                channels: ["y"],
                isAligned: () => true,
                label: "Overlay",
            })
        ).toBe("container");
    });

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

    test("rejects forced container extent when projections differ", () => {
        expect(() =>
            resolveOverlayExtent({
                extent: "container",
                ownerSpec: { vconcat: [] },
                channels: ["x"],
                isAligned: () => false,
                label: 'Ruler param "cursor"',
            })
        ).toThrow(
            'Ruler param "cursor" cannot use extent "container" because its x projections do not align.'
        );
    });

    test("rejects forced container extent for unsupported concat direction", () => {
        expect(() =>
            resolveOverlayExtent({
                extent: "container",
                ownerSpec: { hconcat: [] },
                channels: ["x"],
                isAligned: () => true,
                label: 'Ruler param "cursor"',
            })
        ).toThrow(
            'Ruler param "cursor" cannot use extent "container" for channel "x" in this view.'
        );
    });
});
