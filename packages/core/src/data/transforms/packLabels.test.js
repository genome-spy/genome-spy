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
            _legendEntryX: 0,
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
            _legendEntryX: 0,
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

    expect(data.map((datum) => datum._legendEntryX)).toEqual([0, 30, 78]);
    expect(data.map((datum) => datum._legendEntryWidth)).toEqual([20, 38, 26]);
    expect(data.map((datum) => datum._legendLabelX)).toEqual([14, 44, 92]);
    expect(data.map((datum) => datum._legendLabelY)).toEqual([6, 6, 6]);
});
