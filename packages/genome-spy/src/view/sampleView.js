import {
    findEncodedFields,
    getViewClass,
    isFacetFieldDef,
    isFacetMapping
} from "./viewUtils";
import ContainerView from "./containerView";
import UnitView from "./unitView";
import { mapToPixelCoords } from "../utils/layout/flexLayout";
import AxisWrapperView from "./axisWrapperView";
import DataSource from "../data/dataSource";
import { SampleAttributePanel } from "./sampleAttributePanel";
import SampleHandler from "../sampleHandler/sampleHandler";
import { peek } from "../utils/arrayUtils";
import contextMenu from "../contextMenu";

/**
 * Implements faceting of multiple samples. The samples are displayed
 * as tracks and optional metadata.
 *
 * @typedef {import("../utils/layout/flexLayout").LocSize} LocSize
 * @typedef {import("./view").default} View
 * @typedef {import("./layerView").default} LayerView
 *
 */
export default class SampleView extends ContainerView {
    /**
     *
     * @param {import("./viewUtils").SampleSpec} spec
     * @param {import("./viewUtils").ViewContext} context
     * @param {ContainerView} parent
     * @param {string} name
     */
    constructor(spec, context, parent, name) {
        super(spec, context, parent, name);

        this.spec = spec;

        const View = getViewClass(spec.spec);
        this.child = /** @type { UnitView | LayerView | AxisWrapperView } */ (new View(
            spec.spec,
            context,
            this,
            `sample`
        ));

        this.sampleHandler = new SampleHandler();

        this.attributeView = new SampleAttributePanel(this);

        this.child.addEventListener(
            "contextmenu",
            this.handleContextMenu.bind(this)
        );
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        yield this.child;
        yield this.attributeView;
    }

    /**
     * @param {import("./view").default} child
     * @param {import("./view").default} replacement
     */
    replaceChild(child, replacement) {
        if (child !== this.child) {
            throw new Error("Not my child!");
        }

        this.child = /** @type {UnitView | LayerView | AxisWrapperView} */ (replacement);
    }

    async loadData() {
        const dataPromise = super.loadData();

        if (this.spec.samples.data) {
            const sampleDataSource = new DataSource(
                this.spec.samples.data,
                this.context.genomeSpy.config.baseUrl
            );
            this.sampleHandler.setSamples(
                processSamples(await sampleDataSource.getUngroupedData())
            );
        }

        return dataPromise;
    }

    transformData() {
        super.transformData();

        // A hacky solution for updating facets. TODO: Something more robust.
        // Perhaps an "updateFacets" method that is called during initialization,
        // after transformData.

        if (!this.spec.samples.data) {
            const resolution = this.getResolution("sample");
            if (resolution) {
                this.sampleHandler.setSamples(
                    resolution.getDataDomain().map((s, i) => ({
                        id: s,
                        displayName: s,
                        indexNumber: i,
                        attributes: []
                    }))
                );
            } else {
                throw new Error(
                    "No explicit sample data nor sample channels found!"
                );
            }
        }
    }

    getSampleLocations() {
        const pxHeight = this._coords.height;

        const flattened = this.sampleHandler.getFlattenedGroupHierarchy();

        const sampleGroups = flattened
            .map(
                group =>
                    /** @type {import("../sampleHandler/sampleHandler").SampleGroup} */ (peek(
                        group
                    )).samples
            )
            // Skip empty groups
            .filter(samples => samples.length);

        const groupLocations = mapToPixelCoords(
            sampleGroups.map(group => ({ grow: group.length })),
            pxHeight,
            {
                spacing: 5
            }
        );

        /** @type {{ sampleId: string, location: LocSize }[]} */
        const sampleLocations = [];

        for (const [gi, samples] of sampleGroups.entries()) {
            const sizeDef = { grow: 1 };
            mapToPixelCoords(
                samples.map(d => sizeDef),
                groupLocations[gi].size,
                {
                    offset: groupLocations[gi].location
                }
            ).forEach((location, i) => {
                sampleLocations.push({
                    sampleId: samples[i],
                    location: {
                        location: location.location / pxHeight,
                        size: location.size / pxHeight
                    }
                });
            });
        }

        return sampleLocations;
    }

    /**
     *
     * @param {number} pos Coordinate on unit scale
     */
    getSampleIdAt(pos) {
        const match = this.getSampleLocations().find(
            sl =>
                pos >= sl.location.location &&
                pos < sl.location.location + sl.location.size
        );
        if (match) {
            return match.sampleId;
        }
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    renderChild(context, coords, options = {}) {
        for (const sampleLocation of this.getSampleLocations()) {
            this.child.render(context, coords, {
                ...options,
                sampleFacetRenderingOptions: {
                    pos: sampleLocation.location.location,
                    height: sampleLocation.location.size
                },
                facetId: sampleLocation.sampleId
            });
        }
    }

    /**
     * @param {import("./renderingContext/viewRenderingContext").default} context
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("./view").RenderingOptions} [options]
     */
    render(context, coords, options = {}) {
        coords = coords.shrink(this.getPadding());
        context.pushView(this, coords);

        // Store coords for layout computations. Not pretty, but probably
        // works because only a single instance of this view is rendered.
        this._coords = coords;

        const cols = mapToPixelCoords(
            [this.attributeView.getSize().width, { grow: 1 }],
            coords.width,
            { spacing: 10 }
        );

        /** @param {LocSize} location */
        const toColumnCoords = location =>
            coords.modify({
                x: location.location + coords.x,
                width: location.size
            });

        this.attributeView.render(context, toColumnCoords(cols[0]), options);
        this.renderChild(context, toColumnCoords(cols[1]), options);

        context.popView(this);
    }

    /**
     * @param {import("../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../utils/interactionEvent").default} event
     */
    handleContextMenu(coords, event) {
        // TODO: Allow for registering listeners
        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);

        const normalizedX = coords.normalizePoint(event.point.x, event.point.y)
            .x;
        const domainX = this.getResolution("x")
            .getScale()
            .invert(normalizedX);

        const fieldInfos = findEncodedFields(this.child).filter(
            d => !["sample", "x", "x2"].includes(d.channel)
        );

        /** @type {import("../contextMenu").MenuItem[]} */
        let items = [];

        for (const fieldInfo of fieldInfos) {
            items.push({
                label: `${fieldInfo.field} (${fieldInfo.view.spec.title ||
                    fieldInfo.view.spec.name})`,
                type: "header"
            });

            items.push({
                label: "Sort by",
                callback: () => {
                    alert(
                        `TODO ... ${fieldInfo.view.getPathString()}, ${normalizedX}, ${domainX}`
                    );
                }
            });
        }

        contextMenu({ items }, mouseEvent);
    }

    /**
     * @param {string} channel
     */
    getDefaultResolution(channel) {
        return channel == "x" ? "shared" : "independent";
    }
}

/**
 *
 * @param {any} row
 */
function extractAttributes(row) {
    const attributes = Object.assign({}, row);
    delete attributes.sample;
    delete attributes.displayName;
    return attributes;
}

/**
 * @param {any[]} flatSamples
 */
function processSamples(flatSamples) {
    return flatSamples.map((d, i) => ({
        id: d.sample,
        displayName: d.displayName || d.sample,
        indexNumber: i,
        attributes: extractAttributes(d)
    }));
}
