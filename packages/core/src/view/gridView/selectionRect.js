import UnitView from "../unitView.js";

export default class SelectionRect extends UnitView {
    /**
     * @param {import("./gridChild.js").default} gridChild
     * @param {import("../../spec/channel.js").PrimaryPositionalChannel[]} channels
     */
    constructor(gridChild, channels) {
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
                    // TODO: Consider using Exprs instead
                    ...(channels.includes("x")
                        ? {
                              x: { field: "x", type: null },
                              x2: { field: "x2" },
                          }
                        : {}),
                    ...(channels.includes("y")
                        ? {
                              y: { field: "y", type: "quantitative" },
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
    }

    get #datasource() {
        return /** @type {import("../../data/sources/inlineSource.js").default} */ (
            this.context.dataFlow.findDataSourceByKey(this)
        );
    }

    /**
     *
     * @param {number[]} x
     * @param {number[]} y
     */
    update(x, y) {
        const datum = {
            x: x?.[0],
            x2: x?.[1],
            y: y?.[0],
            y2: y?.[1],
        };

        this.#datasource.updateDynamicData([datum]);
    }

    clear() {
        this.#datasource.updateDynamicData([]);
    }
}
