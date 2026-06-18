import { expect, test } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import PackLegendLabelsTransform from "./packLegendLabels.js";

test("PackLegendLabelsTransform stacks vertical legend entries using max column width", () => {
    const transform = new PackLegendLabelsTransform(
        {
            type: "packLegendLabels",
            labelWidth: "_labelWidth",
            direction: "vertical",
            symbolSize: 100,
            symbolStrokeWidth: 0,
            labelOffset: 4,
            fontSize: 12,
            rowPadding: 2,
        },
        makeParamRuntimeProvider()
    );

    const data = processData(transform, [
        { label: "USA", _labelWidth: 18, _legendIndex: 0 },
        { label: "Europe", _labelWidth: 36, _legendIndex: 1 },
    ]);

    expect(data.map((datum) => datum.row)).toEqual([0, 1]);
    expect(data.map((datum) => datum.column)).toEqual([0, 0]);
    expect(data.map((datum) => datum.entryX)).toEqual([5, 5]);
    expect(data.map((datum) => datum.entryY)).toEqual([0, 14]);
    expect(data.map((datum) => datum.entryWidth)).toEqual([50, 50]);
    expect(data.map((datum) => datum.labelX)).toEqual([14, 14]);
    expect(data.map((datum) => datum.labelY)).toEqual([6, 20]);
});

test("PackLegendLabelsTransform packs horizontal legend entries by measured label width", () => {
    const transform = new PackLegendLabelsTransform(
        {
            type: "packLegendLabels",
            labelWidth: "_labelWidth",
            direction: "horizontal",
            symbolSize: 100,
            symbolStrokeWidth: 0,
            labelOffset: 4,
            fontSize: 12,
            columnPadding: 10,
        },
        makeParamRuntimeProvider()
    );

    const data = processData(transform, [
        { label: "A", _labelWidth: 6, _legendIndex: 0 },
        { label: "Long", _labelWidth: 24, _legendIndex: 1 },
        { label: "BB", _labelWidth: 12, _legendIndex: 2 },
    ]);

    expect(data.map((datum) => datum.entryX)).toEqual([5, 35, 83]);
    expect(data.map((datum) => datum.entryWidth)).toEqual([20, 38, 26]);
    expect(data.map((datum) => datum.labelX)).toEqual([14, 44, 92]);
    expect(data.map((datum) => datum.labelY)).toEqual([6, 6, 6]);
});

test("PackLegendLabelsTransform uses per-entry symbol sizes for row height", () => {
    const transform = new PackLegendLabelsTransform(
        {
            type: "packLegendLabels",
            labelWidth: "_labelWidth",
            direction: "vertical",
            symbolSize: "_symbolSize",
            symbolStrokeWidth: 0,
            labelOffset: 4,
            fontSize: 10,
            rowPadding: 2,
        },
        makeParamRuntimeProvider()
    );

    const data = processData(transform, [
        { label: "small", _labelWidth: 30, _symbolSize: 25 },
        { label: "large", _labelWidth: 30, _symbolSize: 400 },
    ]);

    expect(data.map((datum) => datum.entryHeight)).toEqual([10, 20]);
    expect(data.map((datum) => datum.entryY)).toEqual([0, 12]);
    expect(data.map((datum) => datum.entryX)).toEqual([10, 10]);
    expect(data.map((datum) => datum.labelX)).toEqual([24, 24]);
});

test("PackLegendLabelsTransform applies entry offsets", () => {
    const transform = new PackLegendLabelsTransform(
        {
            type: "packLegendLabels",
            labelWidth: "_labelWidth",
            symbolSize: 100,
            labelOffset: 4,
            fontSize: 12,
            xOffset: 3,
            yOffset: 20,
            yExtent: 80,
        },
        makeParamRuntimeProvider()
    );

    const data = processData(transform, [
        { label: "USA", _labelWidth: 18, _legendIndex: 0 },
    ]);

    expect(data[0]).toMatchObject({
        entryX: 8,
        entryY: 20,
        labelX: 17,
        labelY: 26,
        entryY2: 60,
        labelY2: 54,
    });
});

test("PackLegendLabelsTransform accepts expression-backed y extent", () => {
    const provider = makeParamRuntimeProvider();
    provider.paramRuntime.allocateSetter("height", 80);
    const transform = new PackLegendLabelsTransform(
        {
            type: "packLegendLabels",
            labelWidth: "_labelWidth",
            symbolSize: 100,
            labelOffset: 4,
            fontSize: 12,
            yOffset: 20,
            yExtent: { expr: "height" },
        },
        provider
    );

    let data = processData(transform, [
        { label: "USA", _labelWidth: 18, _legendIndex: 0 },
    ]);

    expect(data[0]).toMatchObject({
        entryY2: 60,
        labelY2: 54,
    });

    const provider2 = makeParamRuntimeProvider();
    provider2.paramRuntime.allocateSetter("height", 120);
    const transform2 = new PackLegendLabelsTransform(
        {
            type: "packLegendLabels",
            labelWidth: "_labelWidth",
            symbolSize: 100,
            labelOffset: 4,
            fontSize: 12,
            yOffset: 20,
            yExtent: { expr: "height" },
        },
        provider2
    );
    data = processData(transform2, [
        { label: "USA", _labelWidth: 18, _legendIndex: 0 },
    ]);

    expect(data[0]).toMatchObject({
        entryY2: 100,
        labelY2: 94,
    });
});
