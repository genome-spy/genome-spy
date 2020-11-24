import { isNumber, span, error } from "vega-util";
import { html } from "lit-html";
import { findEncodedFields, getViewClass } from "../viewUtils";
import ContainerView from "../containerView";
import { mapToPixelCoords } from "../../utils/layout/flexLayout";
import DataSource from "../../data/dataSource";
import { SampleAttributePanel } from "./sampleAttributePanel";
import SampleHandler from "../../sampleHandler/sampleHandler";
import { peek } from "../../utils/arrayUtils";
import contextMenu from "../../utils/ui/contextMenu";
import generateAttributeContextMenu from "./attributeContextMenu";
import { formatLocus } from "../../genome/locusFormat";
import Padding from "../../utils/layout/padding";
import smoothstep from "../../utils/smoothstep";
import { getCachedOrCall } from "../../utils/propertyCacher";
import transition from "../../utils/transition";

const VALUE_AT_LOCUS = "VALUE_AT_LOCUS";

// Between views
const SPACING = 10;

/**
 * Implements faceting of multiple samples. The samples are displayed
 * as tracks and optional metadata.
 *
 * @typedef {import("../../sampleHandler/sampleState").Group} Group
 * @typedef {import("../../utils/layout/flexLayout").LocSize} LocSize
 * @typedef {import("../view").default} View
 * @typedef {import("../layerView").default} LayerView
 * @typedef {import("../unitView").default} UnitView
 * @typedef {import("../decoratorView").default} DecoratorView
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
 * @typedef {object} SampleLocation
 * @prop {string} sampleId
 * @prop {LocSize} location
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
        this.child = /** @type { UnitView | LayerView | DecoratorView } */ (new View(
            spec.spec,
            context,
            this,
            `sample`
        ));

        this.sampleHandler = new SampleHandler();

        this.sampleHandler.provenance.addListener(() => {
            this.context.genomeSpy.computeLayout();
            this.context.animator.requestRender();
        });

        this.attributeView = new SampleAttributePanel(this);

        this.child.addEventListener(
            "contextmenu",
            this._handleContextMenu.bind(this)
        );

        this.sampleHandler.addAttributeInfoSource(VALUE_AT_LOCUS, attribute => {
            const specifier =
                /** @type {LocusSpecifier} */ (attribute.specifier);
            const view = /** @type {UnitView} */ (this.findDescendantByPath(
                specifier.path
            ));

            const xScale = this.getScaleResolution("x").getScale();
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

        this._addBroadcastHandler("layout", () => {
            this._sampleLocations = undefined;
        });

        this._offset = 0;
        this._peekState = 0; // [0, 1]

        this.addEventListener(
            "wheel",
            (coords, event) => {
                const wheelEvent = /** @type {WheelEvent} */ (event.uiEvent);
                if (wheelEvent.shiftKey) {
                    this._offset += wheelEvent.deltaY;

                    //this.context.genomeSpy.computeLayout();
                    this.context.animator.requestRender();

                    // Replace the uiEvent to prevent decoratorView from zooming.
                    // Only allow horizontal panning.
                    event.uiEvent = {
                        type: wheelEvent.type,
                        deltaX: wheelEvent.deltaX,
                        preventDefault: wheelEvent.preventDefault.bind(
                            wheelEvent
                        )
                    };
                }
            },
            true
        );

        // TODO: Remove when appropriate
        // TODO: More centralized management
        document.addEventListener("keydown", event => {
            if (event.code == "KeyZ") {
                this._togglePeek();
            }
        });
    }

    getEffectivePadding() {
        return getCachedOrCall(this, "size/effectivePadding", () => {
            const childEffPad = this.child.getEffectivePadding();

            // TODO: Top / bottom axes
            return this.getPadding().add(
                new Padding(
                    0,
                    childEffPad.right,
                    0,
                    this.attributeView.getSize().width.px +
                        SPACING +
                        childEffPad.left
                )
            );
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

        this.child = /** @type {UnitView | LayerView | DecoratorView} */ (replacement);
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
            const resolution = this.getScaleResolution("sample");
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
        if (!this._sampleLocations) {
            const flattened = this.sampleHandler.getFlattenedGroupHierarchy();

            const fittedLocations = calculateSampleLocations(flattened, {
                canvasHeight: this._coords.height
            });

            const scrollableLocations = calculateSampleLocations(flattened, {
                sampleHeight: 35 // TODO: Configurable
            });

            /** @type {ScrollingContext} */
            const staticContext = {
                getViewportHeight: () => this._coords.height,
                getOffset: () => 0
            };

            /** @type {ScrollingContext} */
            const scrollingContext = {
                getViewportHeight: () => this._coords.height,
                getOffset: () => this._offset
            };

            const ratioSource = () => this._peekState;

            /** @type {SampleLocation[]} */
            const locations = [];
            for (let i = 0; i < fittedLocations.length; i++) {
                locations.push({
                    sampleId: fittedLocations[i].sampleId,
                    location: new TransitioningSampleLocationWrapper(
                        new ScrollableSampleLocationWrapper(
                            fittedLocations[i].location,
                            staticContext
                        ),
                        new ScrollableSampleLocationWrapper(
                            scrollableLocations[i].location,
                            scrollingContext
                        ),
                        ratioSource
                    )
                });
            }

            this._sampleLocations = locations;
        }

        return this._sampleLocations;
    }

    /**
     *
     * @param {number} pos Coordinate on unit scale
     */
    getSampleIdAt(pos) {
        // TODO: Matching should be done without paddings
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
                    locSize: sampleLocation.location
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
            { spacing: SPACING }
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
     *
     */
    _togglePeek() {
        const newState = this._peekState ? 0 : 1;

        transition({
            from: this._peekState,
            to: newState,
            duration: 350,
            onUpdate: value => {
                this._peekState = value;
                this.context.animator.requestRender();
            }
        });
    }

    /**
     * @param {import("../../utils/layout/rectangle").default} coords
     *      Coordinates of the view
     * @param {import("../../utils/interactionEvent").default} event
     */
    _handleContextMenu(coords, event) {
        // TODO: Allow for registering listeners
        const mouseEvent = /** @type {MouseEvent} */ (event.uiEvent);

        const normalizedXPos = coords.normalizePoint(
            event.point.x,
            event.point.y
        ).x;
        const xScale = this.getScaleResolution("x").getScale();

        const invertedX = xScale.invert(normalizedXPos);
        const serializedX =
            "chromMapper" in xScale
                ? xScale.chromMapper().toChromosomal(invertedX)
                : invertedX;

        const fieldInfos = findEncodedFields(this.child).filter(
            d => !["sample", "x", "x2"].includes(d.channel)
        );

        const dispatch = this.sampleHandler.dispatch.bind(this.sampleHandler);

        /** @type {import("../../utils/ui/contextMenu").MenuItem[]} */
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
     * @param {import("../containerView").ResolutionType} resolutionType
     */
    getDefaultResolution(channel, resolutionType) {
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

/**
 * Allows from transitioning between two sample locations.
 */
class TransitioningSampleLocationWrapper {
    /**
     *
     * @param {LocSize} from
     * @param {LocSize} to
     * @param {function():number} ratioSource
     */
    constructor(from, to, ratioSource) {
        this.from = from;
        this.to = to;
        this.ratioSource = ratioSource;
    }

    get location() {
        const ratio = this.ratioSource();
        switch (ratio) {
            case 0:
                return this.from.location;
            case 1:
                return this.to.location;
            default:
                return (
                    ratio * this.to.location + (1 - ratio) * this.from.location
                );
        }
    }

    get size() {
        const ratio = this.ratioSource();
        switch (ratio) {
            case 0:
                return this.from.size;
            case 1:
                return this.to.size;
            default:
                return ratio * this.to.size + (1 - ratio) * this.from.size;
        }
    }
}

/**
 * Wraps a LocSize, converts it into unit range, and allows scrolling by
 * summing an offset to all locations.
 *
 * @typedef {object} ScrollingContext
 * @prop {function():number} getViewportHeight
 * @prop {function():number} getOffset Returns the scroll offset
 */
class ScrollableSampleLocationWrapper {
    /**
     *
     * @param {LocSize} locSize
     * @param {ScrollingContext} context
     */
    constructor(locSize, context) {
        this.locSize = locSize;
        this.context = context;

        const size = this.locSize.size;
        // TODO: These magic numbers could be configurable
        this.padding = size * 0.1 * smoothstep(15, 22, size);
    }

    get location() {
        return (
            (this.locSize.location + this.padding + this.context.getOffset()) /
            this.context.getViewportHeight()
        );
    }

    get size() {
        return (
            (this.locSize.size - 2 * this.padding) /
            this.context.getViewportHeight()
        );
    }
}

/**
 * @param {Group[][]} flattenedGroupHierarchy Flattened sample groups
 * @param {object} object All measures are in pixels
 * @param {number} [object.canvasHeight] Height reserved for all the samples
 * @param {number} [object.sampleHeight] Height of single sample
 * @param {number} [object.groupSpacing] Space between groups
 *
 * @returns {SampleLocation[]}
 */
function calculateSampleLocations(
    flattenedGroupHierarchy,
    { canvasHeight, sampleHeight, groupSpacing } = { groupSpacing: 5 }
) {
    if (!canvasHeight && !sampleHeight) {
        throw new Error("canvasHeight or sampleHeight must be provided!");
    }

    const sampleGroups = flattenedGroupHierarchy
        .map(
            group =>
                /** @type {import("../../sampleHandler/sampleHandler").SampleGroup} */ (peek(
                    group
                )).samples
        )
        // Skip empty groups
        .filter(samples => samples.length);

    /** @type {function(string[]):import("../../utils/layout/flexLayout").SizeDef} */
    const sizeDefGenerator = sampleHeight
        ? group => ({ px: group.length * sampleHeight })
        : group => ({ grow: group.length });

    const groupLocations = mapToPixelCoords(
        sampleGroups.map(sizeDefGenerator),
        canvasHeight,
        { spacing: groupSpacing, reverse: true }
    );

    /** @type {{ sampleId: string, location: LocSize }[]} */
    const sampleLocations = [];

    for (const [gi, samples] of sampleGroups.entries()) {
        const sizeDef = { grow: 1 };
        mapToPixelCoords(
            samples.map(d => sizeDef),
            groupLocations[gi].size,
            {
                offset: groupLocations[gi].location,
                reverse: true
            }
        ).forEach((location, i) => {
            sampleLocations.push({
                sampleId: samples[i],
                location
            });
        });
    }

    return sampleLocations;
}
