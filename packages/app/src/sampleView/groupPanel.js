import { range } from "d3-array";
import { peek } from "@genome-spy/core/utils/arrayUtils.js";
import { invalidatePrefix } from "@genome-spy/core/utils/propertyCacher.js";
import LayerView from "@genome-spy/core/view/layerView.js";
import { contextMenu } from "../utils/ui/contextMenu.js";
import { iterateGroupHierarchy } from "./sampleSlice.js";
import { isString } from "vega-util";
import { render } from "lit";

export class GroupPanel extends LayerView {
    /**
     * @param {import("./sampleView.js").default} sampleView
     * @param {import("@genome-spy/core/view/containerView.js").default} dataParent
     */
    constructor(sampleView, dataParent) {
        super(
            {
                title: {
                    text: "Groups",
                    orient: "none",
                },

                padding: { right: 0 },

                width: { step: 22 },
                // TODO: Make step size, colors, font size, etc. configurable.

                data: { name: null },

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
                        as: "_title",
                        // The following fails if title is zero (number).
                        // TODO: Implement isValid() from https://github.com/vega/vega/tree/main/packages/vega-functions
                        expr: "datum.title || datum.name",
                    },
                    {
                        type: "formula",
                        as: "_NA",
                        expr: "datum._title === null",
                    },
                    {
                        type: "formula",
                        as: "_title",
                        expr: "datum._title !== null ? datum._title: 'NA'",
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
                            cornerRadiusBottomLeft: 14,
                            cornerRadiusTopLeft: 14,
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
                            text: { field: "_title" },
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
            sampleView,
            dataParent,
            "sample-groups"
        );

        this.sampleView = sampleView;

        this._addBroadcastHandler("layoutComputed", () => {
            this.updateRange();
        });

        this.addInteractionEventListener("contextmenu", (coords, event) => {
            const hover = this.context.getCurrentHover();

            if (!hover) {
                return;
            }

            /** @type {import("./sampleState.js").Group} */
            const group = hover.datum._rawGroup;

            /** @type {import("./sampleState.js").Group[]} */
            let foundPath;
            for (const path of iterateGroupHierarchy(
                this.sampleView.sampleHierarchy.rootGroup
            )) {
                if (path.at(-1) === group) {
                    // Skip root
                    foundPath = path.slice(1);
                    break;
                }
            }

            const action = sampleView.actions.removeGroup({
                path: foundPath.map((group) => group.name),
            });
            const info = sampleView.provenance.getActionInfo(action);
            const dispatch = sampleView.provenance.storeHelper.getDispatcher();

            contextMenu(
                {
                    items: [
                        // TODO: Use actionToItem from attributeContextMenu.js
                        {
                            label: info.title,
                            icon: info.icon,
                            callback: () => dispatch(action),
                        },
                    ],
                },
                event.mouseEvent
            );
        });
    }

    updateRange() {
        const groupLocations =
            this.sampleView.locationManager.getLocations()?.groups;

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

        yRes.scale.range(yRange);
    }

    updateGroups() {
        const groupLocations =
            this.sampleView.locationManager.getLocations()?.groups ?? [];

        const dynamicSource =
            /** @type {import("@genome-spy/core/data/sources/namedSource.js").default} */ (
                this.context.dataFlow.findDataSourceByKey(this)
            );

        if (!dynamicSource) {
            // Why this happens? TODO: Investigate
            return;
        }

        const attributeTitles = this.#getAttributeTitles();

        const data = groupLocations.map((g) => ({
            _index: g.key.index,
            _depth: g.key.depth,
            _rawGroup: g.key.group,
            attribute: attributeTitles[g.key.depth],
            // Name identifies a group
            name: g.key.group.name,
            // Title is shown in the vis, defaults to name
            ...(g.key.group.name != g.key.group.title
                ? { title: g.key.group.title }
                : {}),
            n: g.key.n,
        }));

        dynamicSource.updateDynamicData(data);

        // TODO: Get rid of the following. Should happen automatically:
        this.getScaleResolution("x").reconfigure();
        this.getScaleResolution("y").reconfigure();

        if (groupLocations.length) {
            this.updateRange();
        }

        // TODO: Get rid of the following. Should happen automatically:
        peek([...this.getLayoutAncestors()]).visit((view) =>
            invalidatePrefix(view, "size")
        );
    }

    #getAttributeTitles() {
        // Titles may be Lit's TemplateResults, which must be converted to strings.
        const div = document.createElement("div");

        return [null, ...this.sampleView.sampleHierarchy.groupMetadata].map(
            (entry) => {
                if (!entry) {
                    return "unknown";
                }
                const title =
                    this.sampleView.compositeAttributeInfoSource.getAttributeInfo(
                        entry.attribute
                    ).title;

                if (!title) {
                    return "unknown";
                } else if (isString(title)) {
                    return title;
                } else {
                    render(title, div);
                    return div.textContent.replace(/\s+/g, " ").trim();
                }
            }
        );
    }
}
