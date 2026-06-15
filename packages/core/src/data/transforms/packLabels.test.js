import { expect, test } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import PackLabelsTransform from "./packLabels.js";

test("PackLabelsTransform stacks vertical legend entries using max column width", () => {
    const transform = new PackLabelsTransform(
        {
            type: "packLabels",
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
            _legendRow: 0,
            _legendColumn: 0,
            _legendEntryX: 5,
            _legendEntryY: 0,
            _legendEntryWidth: 50,
            _legendEntryHeight: 12,
            _legendLabelX: 14,
            _legendLabelY: 6,
        },
        {
            label: "Europe",
            _labelWidth: 36,
            _legendIndex: 1,
            _legendRow: 1,
            _legendColumn: 0,
            _legendEntryX: 5,
            _legendEntryY: 14,
            _legendEntryWidth: 50,
            _legendEntryHeight: 12,
            _legendLabelX: 14,
            _legendLabelY: 20,
        },
    ]);
});

test("PackLabelsTransform packs horizontal legend entries by measured label width", () => {
    const transform = new PackLabelsTransform(
        {
            type: "packLabels",
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

    expect(data.map((datum) => datum._legendEntryX)).toEqual([5, 35, 83]);
    expect(data.map((datum) => datum._legendEntryWidth)).toEqual([20, 38, 26]);
    expect(data.map((datum) => datum._legendLabelX)).toEqual([14, 44, 92]);
    expect(data.map((datum) => datum._legendLabelY)).toEqual([6, 6, 6]);
});

test("PackLabelsTransform applies entry offsets", () => {
    const transform = new PackLabelsTransform(
        {
            type: "packLabels",
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
        _legendEntryX: 8,
        _legendEntryY: 20,
        _legendLabelX: 17,
        _legendLabelY: 26,
        _legendEntryY2: 60,
        _legendLabelY2: 54,
    });
});

test("PackLabelsTransform accepts expression-backed y extent", () => {
    const provider = makeParamRuntimeProvider();
    provider.paramRuntime.allocateSetter("height", 80);
    const transform = new PackLabelsTransform(
        {
            type: "packLabels",
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
        _legendEntryY2: 60,
        _legendLabelY2: 54,
    });

    const provider2 = makeParamRuntimeProvider();
    provider2.paramRuntime.allocateSetter("height", 120);
    const transform2 = new PackLabelsTransform(
        {
            type: "packLabels",
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
        _legendEntryY2: 100,
        _legendLabelY2: 94,
    });
});
