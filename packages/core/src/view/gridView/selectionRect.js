import UnitView from "../unitView.js";

export default class SelectionRect extends UnitView {
    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {import("../paramMediator.js").ExprRefFunction} selectionExpr
     */
    constructor(gridChild, selectionExpr) {
        const initialSelection =
            /** @type {import("../../types/selectionTypes.js").IntervalSelection} */ (
                selectionExpr()
            );
        const channels = Object.keys(initialSelection.intervals);

        super(
            {
                configurableVisibility: false,
                resolve: {
                    scale: {
                        x: "forced",
                        y: "forced",
                    },
                },
                data: { values: [] },
                mark: {
                    type: "rect",
                    fill: "#80f080",
                    fillOpacity: 0.05,
                    stroke: "black",
                    strokeWidth: 1,
                    clip: true,
                    tooltip: null,
                },
                encoding: {
                    // TODO: Consider using Exprs instead. Handling scoping is tricky, however.
                    ...(channels.includes("x")
                        ? {
                              x: { field: "x", type: null },
                              x2: { field: "x2" },
                          }
                        : {}),
                    ...(channels.includes("y")
                        ? {
                              y: { field: "y", type: null },
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
            const x = selection.intervals.x;
            const y = selection.intervals.y;

            this.update(x, y);
        });
    }

    /**
     *
     * @param {number[]} x
     * @param {number[]} y
     */
    update(x, y) {
        const datasource =
            /** @type {import("../../data/sources/inlineSource.js").default} */ (
                this.context.dataFlow.findDataSourceByKey(this)
            );

        if (!x && !y) {
            datasource.updateDynamicData([]);
        } else {
            datasource.updateDynamicData([
                {
                    x: x?.[0],
                    x2: x?.[1],
                    y: y?.[0],
                    y2: y?.[1],
                },
            ]);
        }
    }
}
