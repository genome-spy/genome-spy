import { describe, expect, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

describe("categorical domain publication", () => {
    test("explicit order and membership change ordinal mapping without reassigning category IDs", async () => {
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

            view.paramRuntime.setValue("order", ["c", "a"]);
            expect(color("b")).toBeUndefined();
            expect([color("c"), color("a")]).toEqual(colors.slice(0, 2));

            view.paramRuntime.setValue("order", ["b", "c", "a"]);
            expect([color("b"), color("c"), color("a")]).toEqual(colors);
            expect([indexer("a"), indexer("b"), indexer("c")]).toEqual(
                encodedRows
            );
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

    test.each(["data-first", "domain-first"])(
        "empty categorical domains retain identity during %s initialization",
        async (initialization) => {
            const { view } = await createHeadlessEngine({
                params: [{ name: "order", value: [] }],
                data: { values: [] },
                mark: "point",
                encoding: {
                    x: {
                        field: "category",
                        type: "nominal",
                        axis: null,
                        scale: { type: "point", domain: { expr: "order" } },
                    },
                    size: {
                        field: "category",
                        type: "nominal",
                        legend: null,
                        scale: {
                            type: "ordinal",
                            domain: { expr: "order" },
                            range: [9, 25],
                        },
                    },
                },
            });
            try {
                const positionScale = view.getScaleResolution("x").getScale();
                const position =
                    /** @type {import("d3-scale").ScalePoint<string>} */ (
                        positionScale
                    );
                const size =
                    /** @type {import("d3-scale").ScaleOrdinal<string, number>} */ (
                        view.getScaleResolution("size").getScale()
                    );
                const indexer = /** @type {any} */ (positionScale.props)
                    .domainIndexer;
                const source =
                    /** @type {import("../data/sources/inlineSource.js").default} */ (
                        view.flowHandle.dataSource
                    );
                const discovery = ["b", "a", "c"];
                const explicit = ["c", "b", "a"];
                expect(indexer.domain()).toEqual([]);
                expect(position.domain()).toEqual([]);

                if (initialization === "domain-first") {
                    view.paramRuntime.setValue("order", explicit);
                }
                source.updateDynamicData(
                    discovery.map((category) => ({ category }))
                );
                // Retained backends intern rows even while an explicit domain is
                // empty; source publication must not change its membership.
                const encodedRows = discovery.map(indexer);
                if (initialization === "data-first") {
                    expect(position.domain()).toEqual([]);
                    view.paramRuntime.setValue("order", explicit);
                }

                expect(position.domain()).toEqual(explicit);
                expect(discovery.map(indexer)).toEqual(encodedRows);
                expect(
                    /** @type {any} */ (positionScale.props).domainIndexer
                ).toBe(indexer);
                expect([position("c"), position("b"), position("a")]).toEqual([
                    0, 0.5, 1,
                ]);
                expect([size("c"), size("b"), size("a")]).toEqual([9, 25, 9]);

                view.paramRuntime.setValue("order", ["a", "c"]);
                expect(position("b")).toBeUndefined();
                expect([position("a"), position("c")]).toEqual([0, 1]);

                view.paramRuntime.setValue("order", ["b", "a", "c"]);
                expect(discovery.map(indexer)).toEqual(encodedRows);
                expect([position("b"), position("a"), position("c")]).toEqual([
                    0, 0.5, 1,
                ]);
            } finally {
                view.disposeSubtree();
            }
        }
    );
});
