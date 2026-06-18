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

    expect(data).toEqual([
        {
            label: "USA",
            _labelWidth: 18,
            _legendIndex: 0,
            legendRow: 0,
            legendColumn: 0,
            legendEntryX: 5,
            legendEntryY: 0,
            legendEntryWidth: 50,
            legendEntryHeight: 12,
            legendLabelX: 14,
            legendLabelY: 6,
        },
        {
            label: "Europe",
            _labelWidth: 36,
            _legendIndex: 1,
            legendRow: 1,
            legendColumn: 0,
            legendEntryX: 5,
            legendEntryY: 14,
            legendEntryWidth: 50,
            legendEntryHeight: 12,
            legendLabelX: 14,
            legendLabelY: 20,
        },
    ]);
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

    expect(data.map((datum) => datum.legendEntryX)).toEqual([5, 35, 83]);
    expect(data.map((datum) => datum.legendEntryWidth)).toEqual([20, 38, 26]);
    expect(data.map((datum) => datum.legendLabelX)).toEqual([14, 44, 92]);
    expect(data.map((datum) => datum.legendLabelY)).toEqual([6, 6, 6]);
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

    expect(data.map((datum) => datum.legendEntryHeight)).toEqual([10, 20]);
    expect(data.map((datum) => datum.legendEntryY)).toEqual([0, 12]);
    expect(data.map((datum) => datum.legendEntryX)).toEqual([10, 10]);
    expect(data.map((datum) => datum.legendLabelX)).toEqual([24, 24]);
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
        legendEntryX: 8,
        legendEntryY: 20,
        legendLabelX: 17,
        legendLabelY: 26,
        legendEntryY2: 60,
        legendLabelY2: 54,
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
        legendEntryY2: 60,
        legendLabelY2: 54,
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
        legendEntryY2: 100,
        legendLabelY2: 94,
    });
});
