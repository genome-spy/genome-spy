import { primaryPositionalChannels } from "../../encoder/encoder.js";
import LayerView from "../layerView.js";

export default class SelectionRect extends LayerView {
    /**
     * @typedef {import("../../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
     * @typedef {import("../../types/selectionTypes.js").IntervalSelection} IntervalSelection
     */

    /** @type {import("../paramMediator.js").ExprRefFunction} */
    _selectionExpr;

    /** @type {() => void} */
    _selectionListener;

    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {import("../paramMediator.js").ExprRefFunction} selectionExpr
     * @param {import("../../spec/parameter.js").BrushConfig} [brushConfig]
     */
    constructor(gridChild, selectionExpr, brushConfig = {}) {
        const initialSelection = /** @type {IntervalSelection} */ (
            selectionExpr()
        );
        const channels = Object.keys(initialSelection.intervals);

        if (primaryPositionalChannels.every((c) => !channels.includes(c))) {
            throw new Error(
                "SelectionRect requires at least one of the channels 'x' or 'y' to be present in the selection."
            );
        }

        /** @type {import("../../spec/view.js").LayerSpec} */
        const layerSpec = {
            name: "selectionRect",
            configurableVisibility: false,
            resolve: {
                scale: {
                    x: "forced",
                    y: "forced",
                },
            },
            data: { values: selectionToData(selectionExpr()) },
            encoding: {},
            layer: [],
        };

        if (channels.includes("x")) {
            layerSpec.encoding.x = {
                field: "_x",
                type: null,
                title: null,
                contributesToScaleDomain: false,
            };
            layerSpec.encoding.x2 = {
                field: "_x2",
                contributesToScaleDomain: false,
            };
        }
        if (channels.includes("y")) {
            layerSpec.encoding.y = {
                field: "_y",
                type: null,
                title: null,
                contributesToScaleDomain: false,
            };
            layerSpec.encoding.y2 = {
                field: "_y2",
                contributesToScaleDomain: false,
            };
        }

        layerSpec.layer.push({
            name: "selectionRectRect",
            mark: {
                type: "rect",
                clip: true,
                ...{
                    fill: "#808080",
                    fillOpacity: 0.05,
                    stroke: "black",
                    strokeWidth: 1,
                    strokeOpacity: 0.2,
                    ...brushConfig,
                },
            },
        });

        const makeExpr = (/** @type {PrimaryPositionalChannel} */ channel) => {
            const resolution = gridChild.view.getScaleResolution(channel);
            return (
                `format(datum._${channel}2 - datum._${channel}, '.3s')` +
                (resolution.type === "locus" ? " + 'b'" : "")
            );
        };

        const labelOffset =
            brushConfig.measure == "inside"
                ? 9
                : brushConfig.measure == "outside"
                  ? -9
                  : 0;

        if (channels.includes("x") && labelOffset != 0) {
            layerSpec.layer.push({
                name: "selectionRectTextX",
                mark: {
                    type: "text",
                    align: "center",
                    paddingX: 5,
                    dy: labelOffset,
                    tooltip: null,
                },
                encoding: {
                    text: { expr: makeExpr("x") },
                    y: channels.includes("y")
                        ? {
                              field: "_y2",
                              type: null,
                              title: null,
                              contributesToScaleDomain: false,
                          }
                        : {
                              value: 1,
                              contributesToScaleDomain: false,
                          },
                    y2: null,
                },
            });
        }

        if (channels.includes("y") && labelOffset != 0) {
            layerSpec.layer.push({
                name: "selectionRectTextY",
                mark: {
                    type: "text",
                    align: "center",
                    paddingY: 5,
                    dy: labelOffset,
                    tooltip: null,
                    angle: -90,
                },
                encoding: {
                    text: { expr: makeExpr("y") },
                    x2: null,
                },
            });
        }

        super(
            layerSpec,
            gridChild.layoutParent.context,
            gridChild.layoutParent,
            gridChild.view,
            "selectionRect", // TODO: Serial
            {
                blockEncodingInheritance: true,
            }
        );

        /** @type {import("../paramMediator.js").ExprRefFunction} */
        this._selectionExpr = selectionExpr;

        this._selectionListener = () => {
            const selection =
                /** @type {import("../../types/selectionTypes.js").IntervalSelection} */ (
                    selectionExpr()
                );

            const datasource =
                /** @type {import("../../data/sources/inlineSource.js").default} */ (
                    this.flowHandle?.dataSource
                );

            if (!datasource) {
                throw new Error(
                    "Cannot find selection rect data source handle!"
                );
            }

            datasource.updateDynamicData(selectionToData(selection));
        };

        selectionExpr.addListener(this._selectionListener);
    }

    /**
     * @override
     */
    dispose() {
        this._selectionExpr.removeListener(this._selectionListener);
        super.dispose();
    }
}

/**
 *  @param {import("../../types/selectionTypes.js").IntervalSelection} selection
 */
function selectionToData(selection) {
    const x = selection.intervals.x;
    const y = selection.intervals.y;

    if (!x && !y) {
        return [];
    } else {
        return [
            {
                // Using a hack here. All properties are prefixed with an underscore
                // to prevent them from being visible in the tooltip.
                // No properties, no tooltip. This still enables picking, masking
                // elements under the selection rect and preventing them being
                // selected or tooltipped.
                // An alternative solution would necessitate adding more flags or
                // logic to force picking in the absence of tooltips.
                _x: x?.[0],
                _x2: x?.[1],
                _y: y?.[0],
                _y2: y?.[1],
            },
        ];
    }
}
