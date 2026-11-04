// @vitest-environment jsdom
// @ts-check
import { describe, expect, it } from "vitest";
import { transforms } from "@genome-spy/core/data/transforms/transformFactory.js";
import { prepareViewHierarchy } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import {
    initializeViewData,
    initializeVisibleViewData,
} from "@genome-spy/core/genomeSpy/viewDataInit.js";
import { createSvg } from "@genome-spy/core/svg/index.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";
import MergeSampleFacets from "./mergeFacets.js";
import {
    formatGroupLevelHeader,
    formatRemoveGroupLabel,
    formatUngroupLabel,
    getGroupLevelAtPosition,
} from "./sampleGroupView.js";

transforms.mergeFacets = MergeSampleFacets;

it.each([300, 40])(
    "projects nested group intervals with summaries at height %s",
    async (height) => {
        const { view, context } = await createSampleViewForTest({
            initializeFlow: false,
            disableGroupUpdates: false,
            spec: {
                config: { mark: { color: "black" } },
                data: {
                    values: ["A", "B", "C", "D"].map((sample) => ({
                        sample,
                        x: 0,
                    })),
                },
                samples: {},
                // Enable a real closeup scroll even in this small cohort.
                sampleLayout: { sampleHeight: 100, peekGroupSpacing: 1000 },
                spec: {
                    name: "sample-plot",
                    mark: "point",
                    encoding: {
                        sample: { field: "sample" },
                        x: {
                            field: "x",
                            type: "quantitative",
                            scale: { domain: [0, 1] },
                            axis: null,
                        },
                    },
                    aggregateSamples: [
                        {
                            height: 20,
                            mark: "point",
                            encoding: {
                                x: { field: "x", type: "quantitative" },
                            },
                        },
                    ],
                },
            },
        });
        const coreView =
            /** @type {import("@genome-spy/core/view/view.js").default} */ (
                /** @type {unknown} */ (view)
            );
        prepareViewHierarchy(coreView);
        await initializeViewData(
            coreView,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );
        // The live app has an initial layout before a user groups samples.
        createSvg({
            viewRoot: coreView,
            logicalWidth: 500,
            logicalHeight: height,
        });
        view.provenance.store.dispatch(
            view.actions.addMetadata({
                columnarMetadata: {
                    sample: ["A", "B", "C", "D"],
                    outer: ["X", "X", "X", "Y"],
                    inner: ["first", "first", "last", "last"],
                },
                attributeDefs: {
                    outer: { type: "nominal", scale: { domain: ["X", "Y"] } },
                    inner: {
                        type: "nominal",
                        scale: { domain: ["first", "last"] },
                    },
                },
            })
        );
        await view.metadataView.awaitMetadataReady();
        for (const specifier of ["outer", "inner"]) {
            view.intentExecutor.dispatch(
                view.actions.groupByNominal({
                    attribute: { type: "SAMPLE_ATTRIBUTE", specifier },
                })
            );
        }
        await Promise.resolve();
        await initializeVisibleViewData(
            coreView,
            context.dataFlow,
            context.textMetrics
        );

        const { svg, warnings } = createSvg({
            viewRoot: coreView,
            logicalWidth: 500,
            logicalHeight: height,
        });
        const bounds = Array.from(
            svg.querySelectorAll(
                '[data-name="sample-groups"] [data-mark-type="rect"] path'
            ),
            (path) => {
                // Asymmetric rounded corners use a path whose first vertical edge
                // reaches the lower bound; corner radii do not alter either edge.
                const d = path.getAttribute("d");
                return [+d.match(/^M \S+ (\S+)/)[1], +d.match(/ V (\S+)/)[1]];
            }
        );
        const expected = view.locationManager
            .getLocations()
            .groups.filter((group) => group.key.depth > 0)
            .map(({ locSize }) => [
                view.childCoords.y + locSize.location,
                view.childCoords.y + locSize.location + locSize.size,
            ])
            .filter(([top, bottom]) => top < height && bottom > 0);

        expect(bounds).toHaveLength(expected.length);
        for (let i = 0; i < bounds.length; i++) {
            expect(Math.abs(bounds[i][0] - expected[i][0])).toBeLessThan(0.11);
            expect(Math.abs(bounds[i][1] - expected[i][1])).toBeLessThan(0.11);
        }
        expect(warnings).toEqual([]);

        if (height === 40) {
            // Fixed summaries exhaust the viewport: zero-height sample points
            // must be absent even though group chrome remains visible.
            expect(view.locationManager.getBandLayout().step).toBe(0);
            expect(
                svg.querySelectorAll(
                    '[data-name="sample-plot"] [data-mark-type="point"] circle'
                )
            ).toHaveLength(0);
        }

        if (height === 300) {
            expect(
                svg.querySelectorAll(
                    '[data-name="sample-plot"] [data-mark-type="point"] circle'
                )
            ).toHaveLength(4);
            const texts = svg.querySelectorAll(
                '[data-name="sample-groups"] text'
            );
            expect(texts).toHaveLength(expected.length);
            texts.forEach((text, i) => {
                const y = +text
                    .getAttribute("transform")
                    .match(/^translate\(\S+ (\S+)\)/)[1];
                expect(
                    Math.abs(y - (expected[i][0] + expected[i][1]) / 2)
                ).toBeLessThan(0.11);
            });

            // A nested ancestor spans the internal gap even when neither leaf
            // has a visible row or summary in the viewport.
            context.animator.requestTransition = (callback) =>
                callback(performance.now() + 1000);
            await view.locationManager.togglePeek(true, 80, "A");
            view.locationManager.setScrollOffset(400);
            const gap = createSvg({
                viewRoot: coreView,
                logicalWidth: 500,
                logicalHeight: height,
            });
            expect(
                gap.svg.querySelectorAll(
                    '[data-name="sample-plot"] [data-mark-type="point"] circle'
                )
            ).toHaveLength(0);
            const ancestor = gap.svg.querySelector(
                '[data-name="sample-groups"] [data-mark-type="rect"] path'
            );
            expect(ancestor).not.toBeNull();
            const d = ancestor.getAttribute("d");
            const top = +d.match(/^M \S+ (\S+)/)[1];
            const bottom = +d.match(/ V (\S+)/)[1];
            expect(top).toBeLessThan(view.childCoords.y);
            expect(bottom).toBeGreaterThan(
                view.childCoords.y + view.childCoords.height
            );
            expect(gap.warnings).toEqual([]);

            // Settled scrolling updates scalar resources while retaining the
            // group offset series used by GPU renderers.
            const groupMarks = view.sampleGroupView
                .getDescendants()
                .filter((descendant) => descendant instanceof UnitView)
                .map((descendant) => descendant.mark);
            for (const mark of groupMarks) {
                mark.initializeRenderingRevisions([]);
            }
            const revisions = groupMarks.map((mark) => ({
                configuration: mark.getRenderingRevision("configuration"),
                resources: mark.getRenderingRevision("resources"),
            }));
            view.locationManager.setScrollOffset(450);
            groupMarks.forEach((mark, index) => {
                expect(mark.getRenderingRevision("configuration")).toBe(
                    revisions[index].configuration
                );
                expect(mark.getRenderingRevision("resources")).toBeGreaterThan(
                    revisions[index].resources
                );
            });
        }
    }
);

describe("SampleGroupView helpers", () => {
    it("resolves group levels from horizontal level regions", () => {
        expect(getGroupLevelAtPosition(0, 72, 3)).toBe(1);
        expect(getGroupLevelAtPosition(23.9, 72, 3)).toBe(1);
        expect(getGroupLevelAtPosition(24, 72, 3)).toBe(2);
        expect(getGroupLevelAtPosition(47.9, 72, 3)).toBe(2);
        expect(getGroupLevelAtPosition(48, 72, 3)).toBe(3);
        expect(getGroupLevelAtPosition(71.9, 72, 3)).toBe(3);
    });

    it("rejects positions outside level regions", () => {
        expect(getGroupLevelAtPosition(-1, 72, 3)).toBeUndefined();
        expect(getGroupLevelAtPosition(72, 72, 3)).toBeUndefined();
        expect(getGroupLevelAtPosition(0, 72, 0)).toBeUndefined();
        expect(getGroupLevelAtPosition(0, 0, 3)).toBeUndefined();
    });

    it("formats level-specific context menu labels", () => {
        expect(formatGroupLevelHeader("Diagnosis", 1, 1)).toBe("Diagnosis");
        expect(formatGroupLevelHeader("Diagnosis", 1, 2)).toBe(
            "Diagnosis (level 1)"
        );
        expect(formatRemoveGroupLabel("Adenocarcinoma")).toBe(
            "Remove group Adenocarcinoma"
        );
        expect(formatUngroupLabel(1)).toBe("Ungroup");
        expect(formatUngroupLabel(2)).toBe("Ungroup from this level");
    });
});
