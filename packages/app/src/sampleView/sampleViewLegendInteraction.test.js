// @vitest-environment jsdom
import { expect, test } from "vitest";
import { initializeViewData } from "@genome-spy/core/genomeSpy/viewDataInit.js";
import Interaction from "@genome-spy/core/utils/interaction.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import Point from "@genome-spy/core/view/layout/point.js";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import { renderToLayout } from "@genome-spy/core/view/testUtils.js";
import PointerCanvas from "../../../core/testFixtures/pointerCanvas.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";

test("routes sample-pane legend brushing and clearing to segment opacity", async () => {
    const { view, context } = await createSampleViewForTest({
        initializeFlow: false,
        spec: {
            config: { legend: { disable: false } },
            data: {
                values: [
                    { sample: "A", start: 0, end: 1, logR: -0.75 },
                    { sample: "A", start: 1, end: 2, logR: 0 },
                    { sample: "B", start: 0, end: 2, logR: 0.75 },
                ],
            },
            samples: {},
            spec: {
                name: "segments",
                params: [
                    {
                        name: "range",
                        select: { type: "interval", encodings: ["color"] },
                        bind: "legend",
                    },
                ],
                mark: "rect",
                encoding: {
                    sample: { field: "sample" },
                    x: { field: "start", type: "quantitative" },
                    x2: { field: "end" },
                    color: {
                        field: "logR",
                        type: "quantitative",
                        scale: { domain: [-1, 1] },
                        legend: { orient: "right" },
                    },
                    opacity: {
                        condition: { param: "range", value: 1 },
                        value: 0,
                    },
                },
            },
        },
    });

    try {
        await initializeViewData(
            view,
            context.dataFlow,
            context.textMetrics,
            () => undefined
        );
        renderToLayout(view, Rectangle.create(0, 0, 500, 250));

        const units = view
            .getDescendants()
            .filter((v) => v instanceof UnitView);
        const segments = units.find((v) => v.name === "segments");
        const ramp = units.find((v) => v.name === "gradientRamp");
        const point = ramp.coords.denormalizePoint(0, 0.75, true);
        const x = point.x + 6;
        const y = point.y + ramp.coords.height / 2;
        const opacity = () =>
            Array.from(segments.getCollector().getData(), (datum) =>
                segments.mark.encoders.fillOpacity(datum)
            );

        expect(opacity()).toEqual([1, 1, 1]);

        const canvas = new PointerCanvas();
        // Start at the sample pane so the test covers routing into its legend.
        view.propagateInteraction(
            new Interaction(
                new Point(x, point.y),
                canvas.event("pointerdown", { clientX: x, clientY: point.y })
            )
        );
        canvas.dispatch("pointermove", { clientX: x, clientY: y });
        canvas.dispatch("pointerup", { clientX: x, clientY: y });
        expect(opacity()).toEqual([0, 1, 0]);

        view.propagateInteraction(
            new Interaction(
                new Point(x, y),
                new MouseEvent("dblclick", { clientX: x, clientY: y })
            )
        );
        expect(opacity()).toEqual([1, 1, 1]);
    } finally {
        view.disposeSubtree();
    }
});
