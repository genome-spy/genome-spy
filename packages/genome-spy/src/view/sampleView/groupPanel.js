import LayerView from "../layerView";

/**
 * This special-purpose class takes care of rendering sample labels and metadata.
 *
 * @typedef {import("./sampleView").Sample} Sample
 * @typedef {import("../view").default} View
 *
 */
export class GroupPanel extends LayerView {
    /**
     * @param {import("./sampleView").default} sampleView
     */
    constructor(sampleView) {
        super(
            {
                width: { step: 20 },

                data: { dynamicSource: true },

                transform: [
                    { type: "filter", expr: "datum.depth > 0" },
                    { type: "formula", as: "_y1", expr: "datum.index * 2" },
                    { type: "formula", as: "_y2", expr: "datum.index * 2 + 1" }
                ],

                encoding: {
                    x: {
                        field: "depth",
                        type: "ordinal",
                        scale: { paddingInner: 0.25 },
                        axis: null
                    },
                    y: {
                        field: "_y1",
                        type: "nominal",
                        scale: {
                            type: "ordinal",
                            domain: [
                                0,
                                1,
                                2,
                                3,
                                4,
                                5,
                                6,
                                7,
                                8,
                                9,
                                10,
                                11,
                                12,
                                13,
                                14,
                                15
                            ]
                        },
                        axis: null
                    },
                    y2: { field: "_y2" }
                },
                layer: [
                    {
                        mark: {
                            type: "rect",
                            clip: true,
                            dynamicData: true,
                            color: "#e8e8e8"
                        }
                    },
                    {
                        mark: {
                            type: "text",
                            clip: true,
                            dynamicData: true,
                            angle: -90
                        },
                        encoding: {
                            text: { field: "name", type: "nominal" }
                        }
                    }
                ]
            },
            sampleView.context,
            undefined,
            "sampleGroups"
        );

        this.sampleView = sampleView;
    }

    updateRange() {
        const viewHeight = this.sampleView?._coords.height ?? 0; // Fugly!!

        const yRes = this.getScaleResolution("y");

        /** @type {number[]} */
        const yRange = [];

        for (const g of this.sampleView.getLocations().groups) {
            yRange.push(1 - (g.locSize.location + g.locSize.size) / viewHeight);
            yRange.push(1 - g.locSize.location / viewHeight);
        }

        //yRes.getScale().domain(yRange.map((x, i) => i));
        yRes.getScale().range(yRange);
        this.context.glHelper.createRangeTexture(yRes, true);
    }
}
