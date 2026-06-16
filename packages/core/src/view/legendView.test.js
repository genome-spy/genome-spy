import { expect, test } from "vitest";
import {
    createGradientLegendSpec,
    createSymbolLegendSpec,
} from "./legendView.js";

/**
 * @param {import("../spec/view.js").LayerSpec} spec
 * @param {string} name
 * @returns {import("../spec/view.js").UnitSpec}
 */
function getLayer(spec, name) {
    const layer = spec.layer.find((layer) => layer.name == name);
    if (!layer || !("mark" in layer)) {
        throw new Error(`Expected unit layer "${name}".`);
    }

    return layer;
}

/**
 * @param {import("../spec/view.js").UnitSpec} layer
 * @param {string} field
 * @returns {string}
 */
function getFormula(layer, field) {
    const formula = layer.transform?.find(
        (transform) => transform.type == "formula" && transform.as == field
    );
    if (!formula || formula.type != "formula") {
        throw new Error(`Expected formula for "${field}".`);
    }

    return formula.expr;
}

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

test("gradient legend uses generated ramp samples and tick samples", () => {
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
    const ramp = getLayer(spec, "gradientRamp");
    const ticks = getLayer(spec, "gradientTicks");
    const labels = getLayer(spec, "gradientLabels");

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
    expect(ticks.data).toEqual({
        lazy: { type: "legendGradientTicks", channel: "color", count: 5 },
    });
    expect(ticks.mark).toMatchObject({ type: "rule", clip: false });
    expect(ticks.encoding).toMatchObject({
        x: { field: "_legendGradientTickX", type: "quantitative" },
        x2: { field: "_legendGradientTickX2", type: "quantitative" },
        y: { field: "_legendGradientTickY", type: "quantitative" },
        y2: { field: "_legendGradientTickY", type: "quantitative" },
    });
    expect(labels.data).toEqual({
        lazy: { type: "legendGradientTicks", channel: "color", count: 5 },
    });
    expect(labels.mark).toMatchObject({
        type: "text",
        clip: false,
        align: "left",
        baseline: "middle",
    });
    expect(labels.encoding).toMatchObject({
        x: { field: "_legendGradientLabelX", type: "quantitative" },
        y: { field: "_legendGradientTickY", type: "quantitative" },
        text: { field: "label" },
    });
});

test("gradient legend positions ramp and ticks in legend pixel space", () => {
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
    const ramp = getLayer(spec, "gradientRamp");
    const ticks = getLayer(spec, "gradientTicks");
    const labels = getLayer(spec, "gradientLabels");

    expect(getFormula(ramp, "_legendGradientY")).toBe(
        "(height - 16) * datum._legendGradientT0"
    );
    expect(getFormula(ramp, "_legendGradientY2")).toBe(
        "(height - 16) * datum._legendGradientT1"
    );
    expect(getFormula(ticks, "_legendGradientTickY")).toBe(
        "(height - 16) * datum._legendGradientT"
    );
    expect(getFormula(labels, "_legendGradientTickY")).toBe(
        "(height - 16) * datum._legendGradientT"
    );
    expect(/** @type {any} */ (ramp.encoding.x).scale.domain).toEqual([
        0,
        { expr: "width" },
    ]);
    expect(/** @type {any} */ (ramp.encoding.y).scale.domain).toEqual([
        0,
        { expr: "height" },
    ]);
    expect(/** @type {any} */ (ticks.encoding.y).scale.domain).toEqual([
        0,
        { expr: "height" },
    ]);
    expect(/** @type {any} */ (labels.encoding.y).scale.domain).toEqual([
        0,
        { expr: "height" },
    ]);
});
