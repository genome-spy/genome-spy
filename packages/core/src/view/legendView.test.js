import { expect, test } from "vitest";
import {
    createGradientLegendSpec,
    createSymbolLegendSpec,
} from "./legendView.js";

test("createSymbolLegendSpec builds generated point and text legend layers", () => {
    const spec = createSymbolLegendSpec({
        entries: [
            { value: "Europe", label: "Europe", _legendIndex: 0 },
            { value: "Japan", label: "Japan", _legendIndex: 1 },
        ],
        scaleName: "color",
        channel: "color",
        symbolChannels: { shape: "shape" },
        legend: {
            title: "Origin",
            orient: "right",
            direction: "vertical",
            labelFontSize: 10,
            labelOffset: 4,
            rowPadding: 2,
            columnPadding: 10,
            symbolSize: 100,
            symbolStrokeWidth: 1.5,
            symbolType: "circle",
        },
    });

    const symbols = /** @type {import("../spec/view.js").UnitSpec} */ (
        spec.layer[0]
    );
    const title = /** @type {import("../spec/view.js").UnitSpec} */ (
        spec.layer[1]
    );
    const labels = /** @type {import("../spec/view.js").UnitSpec} */ (
        spec.layer[2]
    );

    expect(spec.name).toBe("legend_right");
    expect(spec.data).toEqual({
        values: [
            { value: "Europe", label: "Europe", _legendIndex: 0 },
            { value: "Japan", label: "Japan", _legendIndex: 1 },
        ],
    });
    expect(spec.transform).toEqual([
        {
            type: "measureText",
            field: "label",
            as: "_legendLabelWidth",
            fontSize: 10,
            font: undefined,
            fontStyle: undefined,
            fontWeight: undefined,
        },
        {
            type: "packLabels",
            labelWidth: "_legendLabelWidth",
            direction: "vertical",
            columns: undefined,
            symbolSize: 100,
            symbolStrokeWidth: 1.5,
            labelOffset: 4,
            fontSize: 10,
            rowPadding: 2,
            columnPadding: 10,
            yOffset: 16,
            yExtent: { expr: "height" },
        },
    ]);
    expect(spec.layer).toHaveLength(3);
    expect(symbols.mark).toMatchObject({
        type: "point",
        filled: false,
        clip: false,
        size: 100,
    });
    expect(symbols.encoding).toMatchObject({
        x: { field: "_legendEntryX", type: "quantitative" },
        y: { field: "_legendLabelY2", type: "quantitative" },
        color: { field: "value", type: "nominal", scale: { name: "color" } },
        shape: { field: "value", type: "nominal", scale: { name: "shape" } },
    });
    expect(title.mark).toMatchObject({
        type: "text",
        clip: false,
        align: "left",
        baseline: "middle",
        text: "Origin",
    });
    expect(title.data).toEqual({
        values: [{ _legendTitleX: 0, _legendTitleOffset: 5.5 }],
    });
    expect(title.transform).toEqual([
        {
            type: "formula",
            expr: "height - datum._legendTitleOffset",
            as: "_legendTitleY2",
        },
    ]);
    expect(title.encoding).toMatchObject({
        x: { field: "_legendTitleX", type: "quantitative" },
        y: { field: "_legendTitleY2", type: "quantitative" },
    });
    expect(/** @type {any} */ (symbols.encoding.x).scale.domain).toEqual([
        0,
        { expr: "width" },
    ]);
    expect(/** @type {any} */ (symbols.encoding.y).scale.domain).toEqual([
        0,
        { expr: "height" },
    ]);
    expect(labels.mark).toMatchObject({
        type: "text",
        clip: false,
        align: "left",
        baseline: "middle",
    });
    expect(labels.encoding).toMatchObject({
        x: { field: "_legendLabelX", type: "quantitative" },
        y: { field: "_legendLabelY2", type: "quantitative" },
        text: { field: "label" },
    });
});

test("createGradientLegendSpec builds generated rect ramp layer", () => {
    const spec = createGradientLegendSpec({
        scaleName: "color",
        channel: "color",
        legend: {
            title: "measurement",
            orient: "right",
            titleFontSize: 11,
            titlePadding: 5,
        },
    });
    const ramp = /** @type {import("../spec/view.js").UnitSpec} */ (
        spec.layer[0]
    );

    expect(spec.name).toBe("legend_right");
    expect(spec.data).toEqual({
        lazy: { type: "legendGradient", channel: "color", count: 64 },
    });
    expect(ramp.mark).toMatchObject({
        type: "rect",
        clip: false,
    });
    expect(ramp.encoding).toMatchObject({
        x: { field: "_legendGradientX", type: "quantitative" },
        x2: { field: "_legendGradientX2", type: "quantitative" },
        y: { field: "_legendGradientY2", type: "quantitative" },
        y2: { field: "_legendGradientY", type: "quantitative" },
        color: {
            field: "value",
            type: "quantitative",
            scale: { name: "color" },
        },
    });
});
