import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

describe("categorical domain publication", () => {
    test("reactive explicit order changes color mapping without reassigning category IDs", async () => {
        const { view } = await createHeadlessEngine({
            params: [{ name: "order", value: ["a", "b", "c"] }],
            data: {
                values: [
                    { category: "a" },
                    { category: "b" },
                    { category: "c" },
                ],
            },
            mark: "point",
            encoding: {
                color: {
                    field: "category",
                    type: "nominal",
                    scale: {
                        domain: { expr: "order" },
                        range: ["red", "green", "blue"],
                    },
                },
            },
        });
        try {
            const resolution = view.getScaleResolution("color");
            const scale = resolution.getScale();
            const color =
                /** @type {import("d3-scale").ScaleOrdinal<string, string>} */ (
                    scale
                );
            const colors = [color("a"), color("b"), color("c")];
            const indexer = /** @type {any} */ (scale.props).domainIndexer;
            const encodedRows = [indexer("a"), indexer("b"), indexer("c")];
            /** @type {any[][]} */
            const observed = [];
            resolution.addEventListener("domain", () => {
                // Domain order may change without uploading new vertex data.
                // Its codes must still address the retained row codes.
                const indexer = /** @type {any} */ (scale.props).domainIndexer;
                observed.push([
                    resolution.getDomain(),
                    [indexer("c"), indexer("a"), indexer("b")],
                ]);
            });

            view.paramRuntime.setValue("order", ["c", "a", "b"]);

            expect(observed).toEqual([
                [
                    ["c", "a", "b"],
                    [2, 0, 1],
                ],
            ]);
            expect(/** @type {any} */ (scale.props).domainIndexer).toBe(
                indexer
            );
            expect([indexer("a"), indexer("b"), indexer("c")]).toEqual(
                encodedRows
            );
            expect([color("c"), color("a"), color("b")]).toEqual(colors);
        } finally {
            view.disposeSubtree();
        }
    });

    test("inferred categories retain indexes when they disappear and later reappear", async () => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ category: "a" }, { category: "b" }] },
            mark: "point",
            encoding: { color: { field: "category", type: "nominal" } },
        });
        try {
            const resolution = view.getScaleResolution("color");
            const scale = resolution.getScale();
            const indexer = /** @type {any} */ (scale.props).domainIndexer;
            const initialIndexes = [indexer("a"), indexer("b")];
            const source =
                /** @type {import("../data/sources/inlineSource.js").default} */ (
                    view.flowHandle.dataSource
                );

            source.updateDynamicData([{ category: "b" }]);
            expect(resolution.getDomain()).toEqual(["b"]);
            expect(indexer("b")).toBe(initialIndexes[1]);

            // Encounter order changes, but existing GPU attribute values keep
            // their meaning when a removed category returns.
            source.updateDynamicData([
                { category: "c" },
                { category: "b" },
                { category: "a" },
            ]);
            expect(resolution.getDomain()).toEqual(["a", "b", "c"]);
            expect([indexer("a"), indexer("b")]).toEqual(initialIndexes);
            expect(indexer("c")).toBe(2);
            expect(/** @type {any} */ (scale.props).domainIndexer).toBe(
                indexer
            );
        } finally {
            view.disposeSubtree();
        }
    });
});
