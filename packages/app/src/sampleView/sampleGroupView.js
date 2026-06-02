import { range } from "d3-array";
import LayerView from "@genome-spy/core/view/layerView.js";
import { contextMenu, DIVIDER } from "../utils/ui/contextMenu.js";
import { iterateGroupHierarchy } from "./state/sampleSlice.js";
import { isString } from "vega-util";
import { render } from "lit";
import { showRetainGroupsByRankDialog } from "./groupDialogs/retainGroupsByRankDialog.js";
import { showRetainGroupsBySizeDialog } from "./groupDialogs/retainGroupsBySizeDialog.js";
import { faFilter, faObjectGroup } from "@fortawesome/free-solid-svg-icons";

const GROUP_COLUMN_WIDTH = { step: 24 };

/**
 * @extends {LayerView<import("../spec/view.js").AppLayerSpec>}
 */
export default class SampleGroupView extends LayerView {
    #hasVisibleGroups = true;

    /**
     * @param {import("./sampleView.js").default} sampleView
     * @param {import("@genome-spy/core/view/containerView.js").default} sidebarView
     */
    constructor(sampleView, sidebarView) {
        /** @type {import("../spec/view.js").AppLayerSpec} */
        const spec = {
            name: "sample-groups",
            title: {
                text: "Groups",
                orient: "none",
            },
            configurableVisibility: true,

            width: GROUP_COLUMN_WIDTH,
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
                        paddingInner: 0.2272727,
                        paddingOuter: 0,
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
        };

        super(
            spec,
            sampleView.context,
            sidebarView,
            sidebarView,
            "sample-groups"
        );

        this.sampleView = sampleView;

        this._addBroadcastHandler("layoutComputed", () => {
            this.updateRange();
        });

        this.addInteractionListener("contextmenu", (event) => {
            const hover = this.context.getCurrentHover();

            if (!hover) {
                return;
            }

            /** @type {import("./state/sampleState.js").Group} */
            const group = hover.datum._rawGroup;

            /** @type {import("./state/sampleState.js").Group[]} */
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

            if (!foundPath) {
                return;
            }

            const level = foundPath.length;
            const action = sampleView.actions.removeGroup({
                path: foundPath.map((group) => group.name),
            });
            const ungroupAction = sampleView.actions.ungroup({ level });
            const store = sampleView.provenance.store;
            const hasMultipleGroupLevels =
                sampleView.sampleHierarchy.groupMetadata.length > 1;

            /**
             * @param {import("@reduxjs/toolkit").PayloadAction<any>} action
             * @param {string} [label]
             * @returns {import("../utils/ui/contextMenu.js").MenuItem}
             */
            const actionToItem = (action, label) => {
                const info = sampleView.provenance.getActionInfo(action);
                return {
                    label: label ?? info.title,
                    icon: info.icon,
                    callback: () => store.dispatch(action),
                };
            };

            contextMenu(
                {
                    items: [
                        {
                            label: group.title ?? group.name,
                            type: "header",
                        },
                        actionToItem(action),
                        DIVIDER,
                        {
                            icon: faFilter,
                            label: hasMultipleGroupLevels
                                ? "Retain groups at this level"
                                : "Retain groups",
                            submenu: [
                                {
                                    icon: faFilter,
                                    label: hasMultipleGroupLevels
                                        ? "Ranked groups by size at this level..."
                                        : "Ranked groups by size...",
                                    callback: () =>
                                        showRetainGroupsByRankDialog(
                                            sampleView,
                                            level
                                        ),
                                },
                                {
                                    icon: faFilter,
                                    label: hasMultipleGroupLevels
                                        ? "Groups by size threshold at this level..."
                                        : "Groups by size threshold...",
                                    callback: () =>
                                        showRetainGroupsBySizeDialog(
                                            sampleView,
                                            level
                                        ),
                                },
                            ],
                        },
                        DIVIDER,
                        {
                            ...actionToItem(
                                ungroupAction,
                                hasMultipleGroupLevels
                                    ? "Ungroup from this level"
                                    : "Ungroup"
                            ),
                            icon: faObjectGroup,
                        },
                    ],
                },
                event.mouseEvent
            );
        });
    }

    /**
     * @override
     */
    async initializeChildren() {
        await super.initializeChildren();
        this.registerStepSizeInvalidation();
    }

    /**
     * @override
     */
    isConfiguredVisible() {
        return this.#hasVisibleGroups && super.isConfiguredVisible();
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
        const hasVisibleGroups = groupLocations.some((g) => g.key.depth > 0);

        this.#setGroupColumnVisibility(hasVisibleGroups);

        const dynamicSource =
            /** @type {import("@genome-spy/core/data/sources/namedSource.js").default} */ (
                this.flowHandle?.dataSource
            );

        if (!dynamicSource) {
            throw new Error("Cannot find sample group data source handle!");
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
            ...(g.key.group.generatedTitle
                ? { interval: g.key.group.generatedTitle }
                : {}),
            n: g.key.n,
        }));

        dynamicSource.updateDynamicData(data);

        if (groupLocations.length) {
            this.updateRange();
        }
    }

    /**
     * @param {boolean} visible
     */
    #setGroupColumnVisibility(visible) {
        if (this.#hasVisibleGroups === visible) {
            return;
        }

        this.#hasVisibleGroups = visible;
        this.invalidateSizeCache();
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
