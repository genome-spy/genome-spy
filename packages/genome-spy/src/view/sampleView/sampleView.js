import { isNumber, span, error } from "vega-util";
import { html } from "lit-html";
import { findEncodedFields, getViewClass } from "../viewUtils";
import ContainerView from "../containerView";
import { mapToPixelCoords } from "../../utils/layout/flexLayout";
import DataSource from "../../data/dataSource";
import { SampleAttributePanel } from "./sampleAttributePanel";
import SampleHandler from "../../sampleHandler/sampleHandler";
import { peek } from "../../utils/arrayUtils";
import contextMenu from "../../contextMenu";
import generateAttributeContextMenu from "./attributeContextMenu";
import { formatLocus } from "../../genome/locusFormat";

const VALUE_AT_LOCUS = "VALUE_AT_LOCUS";

/**
 * Implements faceting of multiple samples. The samples are displayed
 * as tracks and optional metadata.
 *
 * @typedef {import("../../utils/layout/flexLayout").LocSize} LocSize
 * @typedef {import("../view").default} View
 * @typedef {import("../layerView").default} LayerView
 * @typedef {import("../unitView").default} UnitView
 * @typedef {import("../axisWrapperView").default} AxisWrapperView
 * @typedef {import("../../genome/chromMapper").ChromosomalLocus} ChromosomalLocus
 *
 * @typedef {object} Sample Sample metadata
 * @prop {string} id
 * @prop {string} displayName
 * @prop {number} indexNumber For internal user, mainly for shaders
 * @prop {Record<string, any>} attributes Arbitrary sample specific attributes
 *
 * @typedef {object} LocusSpecifier
 * @prop {string[]} path Relative path to the view
 * @prop {string} field
 * @prop {number | ChromosomalLocus} locus Locus on the domain
 *
 */
export default class SampleView extends ContainerView {
    /**
     *
     * @param {import("../viewUtils").SampleSpec} spec
     * @param {import("../viewUtils").ViewContext} context
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

        this.sampleHandler.provenance.addListener(() => {
            this.context.genomeSpy.computeLayout();
            this.context.genomeSpy.renderAll();
        });

        this.attributeView = new SampleAttributePanel(this);

        this.child.addEventListener(
            "contextmenu",
            this.handleContextMenu.bind(this)
        );

        this.sampleHandler.addAttributeInfoSource(VALUE_AT_LOCUS, attribute => {
            const specifier =
                /** @type {LocusSpecifier} */ (attribute.specifier);
            const view = /** @type {UnitView} */ (this.findDescendantByPath(
                specifier.path
            ));

            const xScale = this.getResolution("x").getScale();
            const numericLocus = isNumber(specifier.locus)
                ? specifier.locus
                : "chromMapper" in xScale
                ? xScale
                      .chromMapper()
                      .toContinuous(
                          specifier.locus.chromosome,
                          specifier.locus.pos
                      )
                : error(
                      "Encountered a complex locus but no ChromMapper is available!"
                  );

            /** @param {string} sampleId */
            const accessor = sampleId =>
                view.mark.findDatumAt(sampleId, numericLocus)?.[
                    specifier.field
                ];

            return {
                name: specifier.field,
                // TODO: Truncate view title: https://css-tricks.com/snippets/css/truncate-string-with-ellipsis/
                title: html`
                    <em>${specifier.field}</em>
                    <span class="viewTitle"
                        >(${view.spec.title || view.name})</span
                    >
                    at
                    <span class="locus">${locusToString(specifier.locus)}</span>
                `,
                accessor,
                // TODO: Fix the following
                type: "quantitative",
                scale: undefined
            };
        });
    }

    /**
     * @param {Sample[]} samples
     */
    _setSamples(samples) {
        this._samples = samples;

        this.sampleHandler.setSamples(samples.map(sample => sample.id));

        this.sampleMap = new Map(samples.map(sample => [sample.id, sample]));

        /** @param {string} sampleId */
        this.sampleAccessor = sampleId => this.sampleMap.get(sampleId);
    }

    getAllSamples() {
        return this._samples;
    }

    /**
     * @returns {IterableIterator<View>}
     */
    *[Symbol.iterator]() {
        yield this.child;
        yield this.attributeView;
    }

    /**
     * @param {import("../view").default} child
     * @param {import("../view").default} replacement
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
            this._setSamples(
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
                this._setSamples(
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
                    /** @type {import("../../sampleHandler/sampleHandler").SampleGroup} */ (peek(
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
     * @param {import("../renderingContext/viewRenderingContext").default} context
     * @param {import("../../utils/layout/rectangle").default} coords
     * @param {import("../view").RenderingOptions} [options]
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
     * @param {import("../renderingContext/viewRenderingContext").default} context
     * @param {import("../../utils/layout/rectangle").default} coords
     * @param {import("../view").RenderingOptions} [options]
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
     * @param {import("../../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../../utils/interactionEvent").default} event
     */
    handleContextMenu(coords, event) {
        // TODO: Allow for registering listeners
        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);

        const normalizedXPos = coords.normalizePoint(
            event.point.x,
            event.point.y
        ).x;
        const xScale = this.getResolution("x").getScale();

        const invertedX = xScale.invert(normalizedXPos);
        const serializedX =
            "chromMapper" in xScale
                ? xScale.chromMapper().toChromosomal(invertedX)
                : invertedX;

        const fieldInfos = findEncodedFields(this.child).filter(
            d => !["sample", "x", "x2"].includes(d.channel)
        );

        const dispatch = this.sampleHandler.dispatch.bind(this.sampleHandler);

        /** @type {import("../../contextMenu").MenuItem[]} */
        let items = [
            {
                label: `Locus: ${locusToString(serializedX)}`,
                type: "header"
            },
            { type: "divider" }
        ];

        for (const [i, fieldInfo] of fieldInfos.entries()) {
            let path = fieldInfo.view.getAncestors();
            // takeUntil would be aweseome
            path = path.slice(
                0,
                path.findIndex(v => v === this)
            );

            /** @type {LocusSpecifier} */
            const specifier = {
                // TODO: Relative path
                path: path.map(v => v.name).reverse(),
                field: fieldInfo.field,
                locus: serializedX
            };

            /** @type {import("../../sampleHandler/sampleHandler").AttributeIdentifier} */
            const attribute = { type: VALUE_AT_LOCUS, specifier };

            if (i > 0) {
                items.push({ type: "divider" });
            }

            items.push(
                ...generateAttributeContextMenu(
                    html`
                        <strong>${fieldInfo.field}</strong> (${fieldInfo.view
                            .spec.title || fieldInfo.view.spec.name})
                    `,
                    attribute,
                    "quantitative", // TODO
                    undefined, // TODO
                    dispatch,
                    this.sampleHandler.provenance
                )
            );
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
 * @param {number | ChromosomalLocus} locus
 */
function locusToString(locus) {
    return !isNumber(locus) && "chromosome" in locus
        ? formatLocus(locus)
        : "" + locus;
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
