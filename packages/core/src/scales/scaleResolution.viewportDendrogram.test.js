import { expect, test, vi } from "vitest";
import dendrogramSpec from "../../../../examples/core/marks/link/dendrogram-gaps.json" with { type: "json" };
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import UnitView from "../view/unitView.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

test.each(["horizontal", "vertical"])(
    "fits %s dendrogram heights to complete links during matrix navigation",
    async (orient) => {
        const indexChannel = orient === "horizontal" ? "y" : "x";
        const heightChannel = orient === "horizontal" ? "x" : "y";
        const treeSpec = /** @type {import("../spec/view.js").UnitSpec} */ (
            structuredClone(dendrogramSpec.hconcat[0])
        );
        const heightScale = {
            domain: {
                source: /** @type {const} */ ("viewport"),
                mode: /** @type {const} */ ("contain"),
            },
            padding: 0.02,
            zero: true,
            nice: false,
            zoom: false,
            reverse: orient === "horizontal",
        };
        const { view } = await createHeadlessEngine({
            datasets: structuredClone(dendrogramSpec.datasets),
            columns: orient === "horizontal" ? 2 : 1,
            resolve: { scale: { [indexChannel]: "shared" } },
            scales: { [indexChannel]: { domain: [0, 3], reverse: true } },
            concat: [
                {
                    ...treeSpec,
                    name: "tree",
                    // Exercise both view-level and encoding-level declarations.
                    scales:
                        orient === "horizontal"
                            ? { [heightChannel]: heightScale }
                            : undefined,
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

        /** @param {number} maximum */
        const expectHeightPadding = (maximum) => {
            const scale = height.getScale();
            const baseline = scale(0);
            const top = scale(maximum);
            expect(Math.min(baseline, top)).toBeCloseTo(0.02);
            expect(Math.max(baseline, top)).toBeCloseTo(0.98);
        };
        expectHeightPadding(3);

        vi.useFakeTimers();
        try {
            for (const [domain, maximum] of [
                [[-0.1, 0.9], 0.8],
                [[-0.1, 1.9], 1.6],
                [[3.1, 3.9], 1.6], // No complete edge: retain the previous domain.
                [[0, 4], 3],
            ]) {
                index.getScale().domain(/** @type {number[]} */ (domain));
                await vi.advanceTimersByTimeAsync(150);
                expectHeightPadding(/** @type {number} */ (maximum));
            }
        } finally {
            vi.useRealTimers();
            view.disposeSubtree();
        }
    }
);
