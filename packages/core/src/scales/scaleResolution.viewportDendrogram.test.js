import { expect, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import UnitView from "../view/unitView.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

test.each(["horizontal", "vertical"])(
    "fits %s dendrogram heights to complete links during matrix navigation",
    async (orient) => {
        const indexChannel = orient === "horizontal" ? "y" : "x";
        const heightChannel = orient === "horizontal" ? "x" : "y";
        const heightScale = {
            domain: {
                source: /** @type {const} */ ("viewport"),
                mode: /** @type {const} */ ("contain"),
            },
            zero: true,
            nice: false,
            zoom: false,
            reverse: orient === "horizontal",
        };
        const { view } = await createHeadlessEngine({
            columns: orient === "horizontal" ? 2 : 1,
            resolve: { scale: { [indexChannel]: "shared" } },
            scales: { [indexChannel]: { domain: [0, 3], reverse: true } },
            concat: [
                {
                    name: "tree",
                    // Exercise both view-level and encoding-level declarations.
                    scales:
                        orient === "horizontal"
                            ? { [heightChannel]: heightScale }
                            : undefined,
                    data: {
                        values: [
                            { id: "A", parent: "AB", height: 0, index: 0 },
                            { id: "B", parent: "AB", height: 0, index: 1 },
                            { id: "C", parent: "CD", height: 0, index: 2 },
                            { id: "D", parent: "CD", height: 0, index: 3 },
                            { id: "AB", parent: "root", height: 2 },
                            { id: "CD", parent: "root", height: 4 },
                            { id: "root", parent: null, height: 10 },
                        ],
                    },
                    transform: [
                        {
                            type: "dendrogram",
                            key: "id",
                            parentKey: "parent",
                            height: "height",
                            leafIndex: "index",
                        },
                    ],
                    mark: {
                        type: "link",
                        linkShape: "orthogonal",
                        orient: /** @type {"horizontal" | "vertical"} */ (
                            orient
                        ),
                        clip: true,
                    },
                    encoding: {
                        [indexChannel]: { field: "sourceIndex", type: "index" },
                        [indexChannel + "2"]: { field: "targetIndex" },
                        [heightChannel]: {
                            field: "sourceHeight",
                            type: "quantitative",
                            scale:
                                orient === "vertical" ? heightScale : undefined,
                        },
                        [heightChannel + "2"]: { field: "targetHeight" },
                    },
                },
                {
                    name: "matrix",
                    data: { values: [0, 1, 2, 3] },
                    mark: "rect",
                    encoding: {
                        [indexChannel]: { field: "data", type: "index" },
                    },
                },
            ],
        });
        const units = Array.from(view.getDescendants()).filter(
            (child) => child instanceof UnitView
        );
        const tree = units.find((child) => child.name === "tree");
        const matrix = units.find((child) => child.name === "matrix");
        const index = getRequiredScaleResolution(matrix, indexChannel);
        const height = getRequiredScaleResolution(tree, heightChannel);
        expect(getRequiredScaleResolution(tree, indexChannel)).toBe(index);
        expect(height.getDomain()).toEqual([0, 10]);

        vi.useFakeTimers();
        try {
            for (const [domain, maximum] of [
                [[-0.1, 0.9], 2],
                [[1.9, 3.9], 4],
                [[3.1, 3.9], 4], // No complete edge: retain the previous domain.
                [[0, 4], 10],
            ]) {
                index.getScale().domain(/** @type {number[]} */ (domain));
                await vi.advanceTimersByTimeAsync(150);
                expect(height.getDomain()).toEqual([0, maximum]);
            }
        } finally {
            vi.useRealTimers();
            view.disposeSubtree();
        }
    }
);
