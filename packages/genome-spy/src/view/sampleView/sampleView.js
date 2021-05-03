import { isNumber, error } from "vega-util";
import { html } from "lit";
import { createTexture, setTextureFromArray } from "twgl.js";
import { findEncodedFields, getViewClass } from "../viewUtils";
import ContainerView from "../containerView";
import {
    interpolateLocSizes,
    locSizeEncloses,
    mapToPixelCoords,
    scaleLocSize,
    translateLocSize
} from "../../utils/layout/flexLayout";
import { SampleAttributePanel } from "./sampleAttributePanel";
import SampleHandler from "../../sampleHandler/sampleHandler";
import { peek } from "../../utils/arrayUtils";
import generateAttributeContextMenu from "./attributeContextMenu";
import { formatLocus } from "../../genome/locusFormat";
import Padding from "../../utils/layout/padding";
import smoothstep from "../../utils/smoothstep";
import { getCachedOrCall } from "../../utils/propertyCacher";
import transition from "../../utils/transition";
import { easeCubicOut, easeExpOut } from "d3-ease";
import clamp from "../../utils/clamp";
import createDataSource from "../../data/sources/dataSourceFactory";
import FlowNode from "../../data/flowNode";
import { createChain } from "../flowBuilder";
import ConcatView from "../concatView";
import UnitView from "../unitView";

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
 * @typedef {import("../../data/dataFlow").default<View>} DataFlow
 * @typedef {import("../../data/sources/dynamicSource").default} DynamicSource
 * @typedef {import("../../genome/genome").ChromosomalLocus} ChromosomalLocus
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

        this.stickySummaries = spec.stickySummaries ?? true;

        const View = getViewClass(spec.spec);
        this.child = /** @type { UnitView | LayerView | DecoratorView } */ (new View(
            spec.spec,
            context,
            this,
            `sampleFacet`
        ));

        this.summaryViews = new ConcatView(
            { vconcat: [] },
            context,
            this,
            "sampleSummaries"
        );

        /*
         * We produce an inconsistent view hierarchy by design. The summaries have the
         * enclosing (by the spec) views as their parents, but they are also children of
         * "this.summaryViews". The rationale is: the views inherit encodings and resolutions
         * from their enclosing views but layout and rendering are managed by the SampleView.
         */
        this.child.visit(view => {
            if (view instanceof UnitView) {
                this.summaryViews.children.push(...view.sampleAggregateViews);
            }
        });

        /**
         * There are to ways to manage how facets are drawn:
         *
         * 1) Use one draw call for each facet and pass the location data as a uniform.
         * 2) Draw all facets with one call and pass the facet locations as a texture.
         *
         * The former is suitable for large datasets, which can be subsetted for better
         * performance. The latter one is more performant for cases where each facet
         * consists of few data items (sample attributes / metadata).
         * @type {WebGLTexture}
         */
        this.facetTexture = undefined;
        /** @type {Float32Array} */
        this.facetTextureData = undefined;

        this.sampleHandler = new SampleHandler();

        this.sampleHandler.provenance.addListener(() => {
            // TODO: Handle scroll offset instead
            this._peekState = 0;

            this.context.requestLayoutReflow();
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

            const genome = this.getScaleResolution("x").getGenome();
            const numericLocus = isNumber(specifier.locus)
                ? specifier.locus
                : genome
                ? genome.toContinuous(
                      specifier.locus.chromosome,
                      specifier.locus.pos
                  )
                : error(
                      "Encountered a complex locus but no genome is available!"
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
            this._locations = undefined;
        });

        this._scrollOffset = 0;
        this._scrollableHeight = 0;
        this._peekState = 0; // [0, 1]

        /** @type {number} Recorded so that peek can be offset correctly */
        this._lastMouseY = -1;

        this.addEventListener("mousemove", (coords, event) => {
            // TODO: Should be reset to undefined on mouseout
            this._lastMouseY = event.point.y - coords.y;
        });

        this.addEventListener(
            "wheel",
            (coords, event) => {
                const wheelEvent = /** @type {WheelEvent} */ (event.uiEvent);
                if (this._peekState && !wheelEvent.ctrlKey) {
                    this._scrollOffset = clamp(
                        this._scrollOffset + wheelEvent.deltaY,
                        0,
                        this._scrollableHeight - this._coords.height
                    );

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
        // TODO: Check that the mouse pointer is inside the view (or inside the app instance)
        document.addEventListener("keydown", event => {
            if (event.code == "KeyE" && !event.repeat) {
                this._togglePeek();
            }
        });
        document.addEventListener("keyup", event => {
            if (event.code == "KeyE") {
                this._togglePeek(false);
            }
        });

        if (this.spec.samples.data) {
            this.loadSamples();
        } else {
            // TODO: schedule: extractSamplesFromData()
        }
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
        if (this._samples) {
            throw new Error("Samples have already been set!");
        }

        samples = samples.map((sample, index) => ({
            ...sample,
            indexNumber: index
        }));

        this._samples = samples;

        this.sampleHandler.setSamples(samples.map(sample => sample.id));

        this.sampleMap = new Map(samples.map(sample => [sample.id, sample]));

        /** @param {string} sampleId */
        this.sampleAccessor = sampleId => this.sampleMap.get(sampleId);

        this.attributeView._setSamples(samples);

        // Align size to four bytes
        this.facetTextureData = new Float32Array(
            Math.ceil((samples.length * 2) / 4) * 4
        );
    }

    /**
     * Get all existing samples that are known to the SampleView
     */
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

    loadSamples() {
        if (!this.spec.samples.data) {
            throw new Error(
                "SampleView has no explicit sample metadata specified!"
            );
        }

        const { dataSource, collector } = createChain(
            createDataSource(this.spec.samples.data, this.getBaseUrl()),
            new ProcessSample()
        );

        collector.observers.push(collector =>
            this._setSamples([...collector.getData()])
        );

        // Synchronize loading with other data
        const key = "samples " + this.getPathString();
        this.context.dataFlow.addDataSource(dataSource, key);
    }

    extractSamplesFromData() {
        // TODO: Call this from somewhere!
        const resolution = this.getScaleResolution("sample");
        if (resolution) {
            return resolution.getConfiguredDomain().map((s, i) => ({
                id: s,
                displayName: s,
                indexNumber: i,
                attributes: []
            }));
        } else {
            throw new Error(
                "No explicit sample data nor sample channels found!"
            );
        }
    }

    getLocations() {
        if (!this._locations) {
            const flattened = this.sampleHandler.getFlattenedGroupHierarchy();
            const viewportHeight = this._coords.height;

            const summaryHeight = this.summaryViews?.getSize().height.px ?? 0;

            // Locations squeezed into the viewport height
            const fittedLocations = calculateLocations(
                flattened,
                viewportHeight,
                {
                    canvasHeight: this._coords.height,
                    groupSpacing: 5,
                    summaryHeight
                }
            );

            // Scrollable locations that are shown when "peek" activates
            const scrollableLocations = calculateLocations(
                flattened,
                viewportHeight,
                {
                    sampleHeight: 35, // TODO: Configurable
                    groupSpacing: 15,
                    summaryHeight
                }
            );

            const offsetSource = () => -this._scrollOffset;
            const ratioSource = () => this._peekState;

            /** Store for scroll offset calculation when peek fires */
            this._scrollableLocations = scrollableLocations;

            // TODO: Use groups to calculate
            this._scrollableHeight = scrollableLocations.groupLocations
                .map(d => d.location + d.size)
                .reduce((a, b) => Math.max(a, b), 0);

            /** @type {SampleLocation[]} */
            const sampleLocations = [];
            const fsamplel = fittedLocations.sampleLocations;
            for (let i = 0; i < fsamplel.length; i++) {
                const sampleId = fsamplel[i].sampleId;
                sampleLocations.push({
                    sampleId,
                    location: interpolateLocSizes(
                        fsamplel[i].location,
                        translateLocSize(
                            scrollableLocations.sampleLocations[i].location,
                            offsetSource
                        ),
                        ratioSource
                    )
                });
            }

            /** @type {LocSize[]} */
            const summaryLocations = [];
            const fsuml = fittedLocations.groupLocations;
            for (let i = 0; i < fsuml.length; i++) {
                summaryLocations.push(
                    interpolateLocSizes(
                        fsuml[i],
                        translateLocSize(
                            scrollableLocations.groupLocations[i],
                            offsetSource
                        ),
                        ratioSource
                    )
                );
            }

            this._locations = {
                samples: sampleLocations,
                groups: summaryLocations
            };
        }

        return this._locations;
    }

    /**
     * @param {number} pos
     */
    getSampleIdAt(pos) {
        const match = getSampleLocationAt(pos, this.getLocations().samples);
        if (match) {
            return match.sampleId;
        }
    }

    /**
     * @param {number} pos
     */
    getGroupAt(pos) {
        const groups = this.getLocations().groups;
        const groupIndex = groups.findIndex(locSize =>
            locSizeEncloses(locSize, pos)
        );

        return groupIndex >= 0
            ? { index: groupIndex, location: groups[groupIndex] }
            : undefined;
    }

    /**
     * @param {import("../../utils/layout/rectangle").default} coords
     */
    _clipBySummary(coords) {
        if (this.stickySummaries && this.summaryViews.children.length) {
            const summaryHeight = this.summaryViews.getSize().height.px;
            return coords.modify({
                y: () => coords.y + summaryHeight,
                height: () => coords.height - summaryHeight
            });
        }
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext").default} context
     * @param {import("../../utils/layout/rectangle").default} coords
     * @param {import("../view").RenderingOptions} [options]
     */
    renderChild(context, coords, options = {}) {
        const heightFactor = 1 / coords.height;
        const heightFactorSource = () => heightFactor;

        const clipRect = this._clipBySummary(coords);

        for (const sampleLocation of this.getLocations().samples) {
            this.child.render(context, coords, {
                ...options,
                sampleFacetRenderingOptions: {
                    locSize: scaleLocSize(
                        sampleLocation.location,
                        heightFactorSource
                    )
                },
                facetId: [sampleLocation.sampleId],
                clipRect
            });
        }
    }

    /**
     * @param {import("../renderingContext/viewRenderingContext").default} context
     * @param {import("../../utils/layout/rectangle").default} coords
     * @param {import("../view").RenderingOptions} [options]
     */
    renderSummaries(context, coords, options = {}) {
        options = {
            ...options,
            clipRect: coords
        };

        const summaryHeight = this.summaryViews.getSize().height.px;

        for (const [i, groupLocation] of this.getLocations().groups.entries()) {
            const y = () => {
                const gLoc = groupLocation.location;
                let pos = coords.y + gLoc;
                return this.stickySummaries
                    ? pos + clamp(-gLoc, 0, groupLocation.size - summaryHeight)
                    : pos;
            };

            this.summaryViews.render(
                context,
                coords.modify({ y, height: summaryHeight }),
                { ...options, facetId: [i] }
                //options
            );
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

        this.renderSummaries(context, toColumnCoords(cols[1]), options);

        context.popView(this);
    }

    onBeforeRender() {
        // TODO: Only when needed
        this._updateFacetTexture();
    }

    _updateFacetTexture() {
        const sampleLocations = this.getLocations().samples;
        const sampleMap = this.sampleMap;
        const arr = this.facetTextureData;

        arr.fill(0);

        const height = this._coords.height;

        for (const sampleLocation of sampleLocations) {
            // TODO: Get rid of the map lookup
            const index = sampleMap.get(sampleLocation.sampleId).indexNumber;
            arr[index * 2 + 0] = sampleLocation.location.location / height;
            arr[index * 2 + 1] = sampleLocation.location.size / height;
        }

        const gl = this.context.glHelper.gl;
        const options = {
            internalFormat: gl.RG32F,
            format: gl.RG,
            height: 1
        };

        if (this.facetTexture) {
            setTextureFromArray(gl, this.facetTexture, arr, options);
        } else {
            this.facetTexture = createTexture(gl, {
                ...options,
                src: arr
            });
        }
    }

    /**
     * @param {boolean} [open] open if true, close if false, toggle if undefined
     */
    _togglePeek(open) {
        if (this._peekState > 0 && this._peekState < 1) {
            // Transition is going on
            return;
        }

        if (open !== undefined && open == !!this._peekState) {
            return;
        }

        /** @type {import("../../utils/transition").TransitionOptions} */
        const props = {
            requestAnimationFrame: callback =>
                this.context.animator.requestTransition(callback),
            onUpdate: value => {
                this._peekState = Math.pow(value, 2);
                this.context.animator.requestRender();
            },
            from: this._peekState
        };

        if (this._peekState == 0) {
            const mouseY = this._lastMouseY;
            const sampleId = this.getSampleIdAt(mouseY);

            let target;
            if (sampleId) {
                /** @param {LocSize} locSize */
                const getCentroid = locSize =>
                    locSize.location + locSize.size / 2;

                target = getCentroid(
                    this._scrollableLocations.sampleLocations.find(
                        sampleLocation => sampleLocation.sampleId == sampleId
                    ).location
                );
            } else {
                // Match sample summaries
                const groupInfo = this.getGroupAt(mouseY);
                if (groupInfo) {
                    target =
                        this._scrollableLocations.groupLocations[
                            groupInfo.index
                        ].location -
                        (groupInfo.location.location - mouseY);
                }
            }

            if (target) {
                this._scrollOffset = target - mouseY;
            } else {
                // TODO: Find closest sample instead
                this._scrollOffset =
                    (this._scrollableHeight - this._coords.height) / 2;
            }

            if (this._scrollableHeight > this._coords.height) {
                transition({
                    ...props,
                    to: 1,
                    duration: 500,
                    easingFunction: easeExpOut
                });
            } else {
                // No point to zoom out in peek. Indicate the request registration and
                // refusal with a discrete animation.

                /** @param {number} x */
                const bounce = x => (1 - Math.pow(x * 2 - 1, 2)) * 0.5;

                transition({
                    ...props,
                    from: 0,
                    to: 1,
                    duration: 300,
                    easingFunction: bounce
                });
            }
        } else {
            transition({
                ...props,
                to: 0,
                duration: 400,
                easingFunction: easeCubicOut
            });
        }
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
        const xResolution = this.getScaleResolution("x");
        const xScale = xResolution.getScale();
        const genome = xResolution.getGenome();

        const invertedX = xScale.invert(normalizedXPos);
        const serializedX = genome?.toChromosomal(invertedX) ?? invertedX;

        const fieldInfos = findEncodedFields(this.child)
            .filter(d => !["sample", "x", "x2"].includes(d.channel))
            // TODO: A method to check if a mark covers a range (both x and x2 defined)
            .filter(info => ["rect", "rule"].includes(info.view.getMarkType()));

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
            let path = [...fieldInfo.view.getAncestors()];
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

        this.context.contextMenu({ items }, mouseEvent);
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

class ProcessSample extends FlowNode {
    constructor() {
        super();
        this.reset();
    }

    reset() {
        this._index = 0;
    }

    /**
     *
     * @param {import("../../data/flowNode").Datum} datum
     */
    handle(datum) {
        this._propagate({
            id: datum.sample,
            displayName: datum.displayName || datum.sample,
            indexNumber: this._index++,
            attributes: extractAttributes(datum)
        });
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
 * @param {Group[][]} flattenedGroupHierarchy Flattened sample groups
 * @param {number} viewportHeight
 * @param {object} object All measures are in pixels
 * @param {number} [object.canvasHeight] Height reserved for all the samples
 * @param {number} [object.sampleHeight] Height of single sample
 * @param {number} [object.groupSpacing] Space between groups
 * @param {number} [object.summaryHeight] Height of group summaries
 *
 * @returns {{sampleLocations: SampleLocation[], groupLocations: LocSize[]}}
 */
function calculateLocations(
    flattenedGroupHierarchy,
    viewportHeight,
    { canvasHeight, sampleHeight, groupSpacing = 5, summaryHeight = 0 }
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
        ? group => ({ px: group.length * sampleHeight + summaryHeight })
        : group => ({ px: summaryHeight, grow: group.length });

    const groupLocations = mapToPixelCoords(
        sampleGroups.map(sizeDefGenerator),
        canvasHeight || 0,
        { spacing: groupSpacing }
    );

    /** @type {{ sampleId: string, location: LocSize }[]} */
    const sampleLocations = [];

    for (const [gi, samples] of sampleGroups.entries()) {
        const sizeDef = { grow: 1 };
        mapToPixelCoords(
            samples.map(d => sizeDef),
            Math.max(0, groupLocations[gi].size - summaryHeight),
            {
                offset: groupLocations[gi].location + summaryHeight
            }
        ).forEach((locSize, i) => {
            const { size, location } = locSize;

            // TODO: Make padding configurable
            const padding = size * 0.1 * smoothstep(15, 22, size);

            locSize.location = location + padding;
            locSize.size = size - 2 * padding;

            sampleLocations.push({
                sampleId: samples[i],
                location: locSize
            });
        });
    }

    return {
        sampleLocations,
        groupLocations
    };
}

/**
 *
 * @param {number} pos Coordinate on unit scale
 * @param {SampleLocation[]} [sampleLocations]
 */
function getSampleLocationAt(pos, sampleLocations) {
    // TODO: Matching should be done without paddings
    return sampleLocations.find(sl => locSizeEncloses(sl.location, pos));
}
