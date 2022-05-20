import { range } from "d3-array";
import { peek } from "@genome-spy/core/utils/arrayUtils";
import { invalidatePrefix } from "@genome-spy/core/utils/propertyCacher";
import LayerView from "@genome-spy/core/view/layerView";

/**
 * @typedef {import("./sampleView").Sample} Sample
 * @typedef {import("@genome-spy/core/view/view").default} View
 *
 */
export class GroupPanel extends LayerView {
    /**
     * @param {import("./sampleView").default} sampleView
     */
    constructor(sampleView) {
        super(
            {
                title: {
                    text: "Groups",
                    orient: "none",
                },

                width: { step: 22 },
                // TODO: Make step size, colors, font size, etc. configurable.

                data: { dynamicSource: true },

                transform: [
                    { type: "filter", expr: "datum._depth > 0" },
                    { type: "formula", as: "_y1", expr: "datum._index * 2" },
                    {
                        type: "formula",
                        as: "_y2",
                        expr: "datum._index * 2 + 1",
                    },
                    {
                        type: "formula",
                        as: "_NA",
                        expr: "datum.label == null",
                    },
                    {
                        type: "formula",
                        as: "label",
                        expr: "datum.label != null ? datum.label: 'NA'",
                    },
                ],

                encoding: {
                    x: {
                        field: "_depth",
                        type: "ordinal",
                        scale: {
                            align: 0,
                            padding: 0.2272727,
                        },
                        /*
                        axis: {
                            title: null
                            domain: false
						}
						*/
                        axis: null,
                    },
                    // "Abuse" the ordinal scale on a positional channel.
                    // Its range encodes the positions of the groups and it is updated dynamically
                    // when the samples are peeked and scrolled.
                    y: {
                        field: "_y1",
                        type: "nominal",
                        scale: {
                            type: "ordinal",
                            domain: range(500), // Hack needed because domains are not (yet) sorted
                        },
                        axis: null,
                    },
                    y2: { field: "_y2" },
                },
                layer: [
                    {
                        title: "Group",
                        mark: {
                            type: "rect",
                            clip: true,
                            color: "#e8e8e8",
                        },
                    },
                    {
                        mark: {
                            type: "text",
                            clip: true,
                            angle: -90,
                            paddingY: 5,
                            tooltip: null,
                        },
                        encoding: {
                            text: { field: "label" },
                            opacity: {
                                field: "_NA",
                                type: "nominal",
                                scale: {
                                    type: "ordinal",
                                    domain: [false, true],
                                    range: [1.0, 0.3],
                                },
                            },
                        },
                    },
                ],
            },
            sampleView.context,
            undefined,
            "sample-groups"
        );

        this.sampleView = sampleView;

        this._addBroadcastHandler("layoutComputed", () => {
            this.updateRange();
        });
    }

    updateRange() {
        const groupLocations = this.sampleView.getLocations()?.groups;

        if (!groupLocations?.length) {
            return;
        }

        const viewHeight = this.sampleView?.childCoords.height ?? 0;

        const yRes = this.getScaleResolution("y");

        /** @type {number[]} */
        const yRange = [];

        for (const g of groupLocations) {
            yRange.push(1 - (g.locSize.location + g.locSize.size) / viewHeight);
            yRange.push(1 - g.locSize.location / viewHeight);
        }

        yRes.getScale().range(yRange);
        // TODO: The texture should be updated implicitly when the range is modified
        this.context.glHelper.createRangeTexture(yRes, true);
    }

    updateGroups() {
        const groupLocations = this.sampleView.getLocations()?.groups ?? [];

        const dynamicSource =
            /** @type {import("@genome-spy/core/data/sources/dynamicSource").default} */ (
                this.context.dataFlow.findDataSourceByKey(this)
            );

        if (!dynamicSource) {
            // Why this happens? TODO: Investigate
            return;
        }

        const data = groupLocations.map((g) => ({
            _index: g.key.index,
            _name: g.key.group.name,
            _depth: g.key.depth,
            attribute: g.key.attributeLabel,
            label: g.key.group.label,
            n: g.key.n,
        }));

        dynamicSource.publishData(data);

        // TODO: Get rid of the following. Should happen automatically:
        this.getScaleResolution("x").reconfigure();
        this.getScaleResolution("y").reconfigure();

        if (groupLocations.length) {
            this.updateRange();
        }

        // TODO: Get rid of the following. Should happen automatically:
        peek([...this.getAncestors()]).visit((view) =>
            invalidatePrefix(view, "size")
        );
    }
}
