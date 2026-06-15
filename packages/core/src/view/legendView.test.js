import { expect, test } from "vitest";
import { createSymbolLegendSpec } from "./legendView.js";

test("createSymbolLegendSpec builds generated point and text legend layers", () => {
    const spec = createSymbolLegendSpec({
        entries: [
            { value: "Europe", label: "Europe", _legendIndex: 0 },
            { value: "Japan", label: "Japan", _legendIndex: 1 },
        ],
        scaleName: "color",
        channel: "color",
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
            yExtent: 80,
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
    });
    expect(title.mark).toMatchObject({
        type: "text",
        clip: false,
        align: "left",
        baseline: "middle",
        text: "Origin",
    });
    expect(title.data).toEqual({
        values: [{ _legendTitleX: 0, _legendTitleY: 74.5 }],
    });
    expect(title.encoding).toMatchObject({
        x: { field: "_legendTitleX", type: "quantitative" },
        y: { field: "_legendTitleY", type: "quantitative" },
    });
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
