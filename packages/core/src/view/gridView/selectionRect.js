import UnitView from "../unitView.js";

export default class SelectionRect extends UnitView {
    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {import("../paramMediator.js").ExprRefFunction} selectionExpr
     * @param {import("../../spec/parameter.js").BrushConfig} [brushConfig]
     */
    constructor(gridChild, selectionExpr, brushConfig = {}) {
        const initialSelection =
            /** @type {import("../../types/selectionTypes.js").IntervalSelection} */ (
                selectionExpr()
            );
        const channels = Object.keys(initialSelection.intervals);

        if (
            /** @type {import("../../spec/channel.js").ChannelWithScale[]} */ ([
                "x",
                "y",
            ]).every((c) => !channels.includes(c))
        ) {
            throw new Error(
                "SelectionRect requires at least one of the channels 'x' or 'y' to be present in the selection."
            );
        }

        super(
            {
                configurableVisibility: false,
                resolve: {
                    scale: {
                        x: "forced",
                        y: "forced",
                    },
                },
                data: { values: selectionToData(selectionExpr()) },
                mark: {
                    type: "rect",
                    clip: true,
                    tooltip: null,
                    ...{
                        fill: "#808080",
                        fillOpacity: 0.05,
                        stroke: "black",
                        strokeWidth: 1,
                        strokeOpacity: 0.2,
                        ...brushConfig,
                    },
                },
                encoding: {
                    // TODO: Consider using Exprs instead. Handling scoping is tricky, however.
                    ...(channels.includes("x")
                        ? {
                              x: { field: "x", type: null, title: null },
                              x2: { field: "x2" },
                          }
                        : {}),
                    ...(channels.includes("y")
                        ? {
                              y: { field: "y", type: null, title: null },
                              y2: { field: "y2" },
                          }
                        : {}),
                },
            },
            gridChild.layoutParent.context,
            gridChild.layoutParent,
            gridChild.view,
            "selectionRect", // TODO: Serial
            {
                blockEncodingInheritance: true,
            }
        );

        selectionExpr.addListener(() => {
            const selection =
                /** @type {import("../../types/selectionTypes.js").IntervalSelection} */ (
                    selectionExpr()
                );

            const datasource =
                /** @type {import("../../data/sources/inlineSource.js").default} */ (
                    this.context.dataFlow.findDataSourceByKey(this)
                );

            datasource.updateDynamicData(selectionToData(selection));
        });
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
                x: x?.[0],
                x2: x?.[1],
                y: y?.[0],
                y2: y?.[1],
            },
        ];
    }
}
