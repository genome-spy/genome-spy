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
import transition from "../../utils/transition";
import { easeCubicOut, easeExpOut } from "d3-ease";
import clamp from "../../utils/clamp";
import createDataSource from "../../data/sources/dataSourceFactory";
import FlowNode from "../../data/flowNode";
import { createChain } from "../flowBuilder";
import ConcatView from "../concatView";
import UnitView from "../unitView";
import { GroupPanel } from "./groupPanel";
import { invalidatePrefix } from "../../utils/propertyCacher";
import { createOrUpdateTexture } from "../../gl/webGLHelper";

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
 * @typedef {import("./sampleViewTypes").SampleLocation} SampleLocation
 * @typedef {import("./sampleViewTypes").GroupLocation} GroupLocation
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
        /** @type { UnitView | LayerView | DecoratorView } */
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
            this._updateGroupView();

            // TODO: Handle scroll offset instead
            this._peekState = 0;

            this.context.requestLayoutReflow();
            this.context.animator.requestRender();
        });

        /** @type {ConcatView} */
        this.peripheryView = new ConcatView(
            {
                resolve: {
                    scale: { default: "independent" },
                    axis: { default: "independent" }
                },
                hconcat: []
            },
            context,
            this,
            "periphery"
        );

        this.groupView = new GroupPanel(this);
        this.peripheryView.addChild(this.groupView);

        this.attributeView = new SampleAttributePanel(this);
        this.peripheryView.addChild(this.attributeView);

        this.child.addInteractionEventListener(
            "contextmenu",
            this._handleContextMenu.bind(this)
        );

        this.sampleHandler.addAttributeInfoSource(VALUE_AT_LOCUS, attribute => {
            const specifier =
                /** @type {LocusSpecifier} */ (attribute.specifier);
            const view = /** @type {UnitView} */ (this.findDescendantByPath(
                specifier.path
            ));

            /** @type {number} */
            let numericLocus;
            if (isNumber(specifier.locus)) {
                numericLocus = specifier.locus;
            } else {
                const genome = this.getScaleResolution("x").getGenome();
                if (genome) {
                    numericLocus = genome.toContinuous(
                        specifier.locus.chrom,
                        specifier.locus.pos
                    );
                } else {
                    throw new Error(
                        "Encountered a complex locus but no genome is available!"
                    );
                }
            }

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

        this.addInteractionEventListener("mousemove", (coords, event) => {
            // TODO: Should be reset to undefined on mouseout
            this._lastMouseY = event.point.y - coords.y;
        });

        this.addInteractionEventListener(
            "wheel",
            (coords, event) => {
                const wheelEvent = /** @type {WheelEvent} */ (event.uiEvent);
                if (this._peekState && !wheelEvent.ctrlKey) {
                    this._scrollOffset = clamp(
                        this._scrollOffset + wheelEvent.deltaY,
                        0,
                        this._scrollableHeight - this._coords.height
                    );

                    this.groupView.updateRange();
                    /*
					// Putting this to transition phase causes latency of one frame.
					// TODO: Investigate why.
                    this.context.animator.requestTransition(() =>
                        this.groupView.updateRange()
					);
					*/
                    this.context.animator.requestRender();

                    // Replace the uiEvent to prevent decoratorView from zooming.
                    // Only allow horizontal panning.
                    event.uiEvent = {
                        type: wheelEvent.type,
                        // @ts-ignore
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
        // TODO: Check that the mouse pointer is inside the view (or inside the app instance)
        context.addKeyboardListener("keydown", event => {
            if (event.code == "KeyE" && !event.repeat) {
                this._togglePeek();
            }
        });
        context.addKeyboardListener("keyup", event => {
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
        return this._cache("size/effectivePadding", () => {
            const childEffPad = this.child.getEffectivePadding();

            // TODO: Top / bottom axes
            return this.getPadding().add(
                new Padding(
                    0,
                    childEffPad.right,
                    0,
                    this.peripheryView.getSize().width.px +
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

        if (
            samples.some(
                sample => sample.id === undefined || sample.id === null
            )
        ) {
            throw new Error(
                'The sample metadata contains missing sample ids or the "sample" column is missing!'
            );
        }

        if (new Set(samples.map(sample => sample.id)).size != samples.length) {
            throw new Error(
                "The sample metadata contains duplicate sample ids!"
            );
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
        yield this.peripheryView;
    }

    /**
     * @param {import("../view").default} child
     * @param {import("../view").default} replacement
     */
    replaceChild(child, replacement) {
        const r = /** @type {UnitView | LayerView | DecoratorView} */ (replacement);
        if (child === this.child) {
            this.child = r;
        } else {
            throw new Error("Not my child!");
        }
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

        collector.observers.push(collector => {
            const samples = /** @type {Sample[]} */ (collector.getData());
            this._setSamples([...samples]);
        });

        // Synchronize loading with other data
        const key = "samples " + this.getPathString();
        this.context.dataFlow.addDataSource(dataSource, key);
    }

    extractSamplesFromData() {
        if (this._samples) {
            return; // NOP
        }
        // TODO: Call this from somewhere!
        const resolution = this.getScaleResolution("sample");
        if (resolution) {
            const samples = resolution.getDataDomain().map((s, i) => ({
                id: s,
                displayName: s,
                indexNumber: i,
                attributes: []
            }));

            this._setSamples(samples);
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
                    viewHeight: this._coords.height,
                    groupSpacing: 5, // TODO: Configurable
                    summaryHeight
                }
            );

            // Scrollable locations that are shown when "peek" activates
            const scrollableLocations = calculateLocations(
                flattened,
                viewportHeight,
                {
                    sampleHeight: 35, // TODO: Configurable
                    groupSpacing: 15, // TODO: Configurable
                    summaryHeight
                }
            );

            const offsetSource = () => -this._scrollOffset;
            const ratioSource = () => this._peekState;

            /** Store for scroll offset calculation when peek fires */
            this._scrollableLocations = scrollableLocations;

            // TODO: Use groups to calculate
            this._scrollableHeight = scrollableLocations.summaries
                .map(d => d.locSize.location + d.locSize.size)
                .reduce((a, b) => Math.max(a, b), 0);

            /** @type {<K, T extends import("./sampleViewTypes").KeyAndLocation<K>>(fitted: T[], scrollable: T[]) => T[]} */
            const makeInterpolatedLocations = (fitted, scrollable) => {
                /** @type {any[]} */
                const interactiveLocations = [];
                for (let i = 0; i < fitted.length; i++) {
                    const key = fitted[i].key;
                    interactiveLocations.push({
                        key,
                        locSize: interpolateLocSizes(
                            fitted[i].locSize,
                            translateLocSize(
                                scrollable[i].locSize,
                                offsetSource
                            ),
                            ratioSource
                        )
                    });
                }
                return interactiveLocations;
            };

            this._locations = {
                samples: makeInterpolatedLocations(
                    fittedLocations.samples,
                    scrollableLocations.samples
                ),
                summaries: makeInterpolatedLocations(
                    fittedLocations.summaries,
                    scrollableLocations.summaries
                ),
                groups: makeInterpolatedLocations(
                    fittedLocations.groups,
                    scrollableLocations.groups
                )
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
            return match.key;
        }
    }

    /**
     * @param {number} pos
     */
    getSummaryAt(pos) {
        const groups = this.getLocations().summaries;
        const groupIndex = groups.findIndex(summaryLocation =>
            locSizeEncloses(summaryLocation.locSize, pos)
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
                        sampleLocation.locSize,
                        heightFactorSource
                    )
                },
                facetId: [sampleLocation.key],
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

        for (const [
            i,
            summaryLocation
        ] of this.getLocations().summaries.entries()) {
            const y = () => {
                const gLoc = summaryLocation.locSize.location;
                let pos = coords.y + gLoc;
                return this.stickySummaries
                    ? pos +
                          clamp(
                              -gLoc,
                              0,
                              summaryLocation.locSize.size - summaryHeight
                          )
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
            [this.peripheryView.getSize().width, { grow: 1 }],
            coords.width,
            { spacing: SPACING }
        );

        /** @param {LocSize} location */
        const toColumnCoords = location =>
            coords.modify({
                x: location.location + coords.x,
                width: location.size
            });

        this.peripheryView.render(context, toColumnCoords(cols[0]), options);
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
            const index = sampleMap.get(sampleLocation.key).indexNumber;
            arr[index * 2 + 0] = sampleLocation.locSize.location / height;
            arr[index * 2 + 1] = sampleLocation.locSize.size / height;
        }

        const gl = this.context.glHelper.gl;

        this.facetTexture = createOrUpdateTexture(
            gl,
            {
                internalFormat: gl.RG32F,
                format: gl.RG,
                height: 1
            },
            arr,
            this.facetTexture
        );
    }

    _updateGroupView() {
        this._locations = undefined;

        const dynamicSource = /** @type {import("../../data/sources/dynamicSource").default} */ (this.context.dataFlow.findDataSourceByKey(
            this.groupView
        ));

        dynamicSource.publishData(
            this.getLocations().groups.map(g => ({
                index: g.key.index,
                name: g.key.group.name,
                depth: g.key.depth
            }))
        );

        // TODO: Get rid of the following. Should happen automatically:
        this.groupView.getScaleResolution("x").reconfigure();
        this.groupView.getScaleResolution("y").reconfigure();

        this.groupView.updateRange();

        // TODO: Get rid of the following. Should happen automatically:
        peek([...this.getAncestors()]).visit(view =>
            invalidatePrefix(view, "size")
        );
        this.context.glHelper.invalidateSize();
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
                this.context.animator.requestTransition(() =>
                    this.groupView.updateRange()
                );
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
                    this._scrollableLocations.samples.find(
                        sampleLocation => sampleLocation.key == sampleId
                    ).locSize
                );
            } else {
                // Match sample summaries
                const groupInfo = this.getSummaryAt(mouseY);
                if (groupInfo) {
                    // TODO: Simplify now that target is available in groupLocations
                    target =
                        this._scrollableLocations.summaries[groupInfo.index]
                            .locSize.location -
                        (groupInfo.location.locSize.location - mouseY);
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

        const complexX = this.getScaleResolution("x").invertToComplex(
            normalizedXPos
        );

        const fieldInfos = findEncodedFields(this.child)
            .filter(d => !["sample", "x", "x2"].includes(d.channel))
            // TODO: A method to check if a mark covers a range (both x and x2 defined)
            .filter(info => ["rect", "rule"].includes(info.view.getMarkType()));

        const dispatch = this.sampleHandler.dispatch.bind(this.sampleHandler);

        /** @type {import("../../utils/ui/contextMenu").MenuItem[]} */
        let items = [
            {
                label: `Locus: ${locusToString(complexX)}`,
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
                locus: complexX
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
     * @param {import("../containerView").ResolutionTarget} resolutionType
     * @returns {import("../../spec/view").ResolutionBehavior}
     */
    getDefaultResolution(channel, resolutionType) {
        switch (channel) {
            case "x":
            case "sample":
                return "shared";
            default:
                return "independent";
        }
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
 * @param {number} [object.viewHeight] Height reserved for all the samples
 * @param {number} [object.sampleHeight] Height of single sample
 * @param {number} [object.groupSpacing] Space between groups
 * @param {number} [object.summaryHeight] Height of group summaries
 *
 */
function calculateLocations(
    flattenedGroupHierarchy,
    viewportHeight,
    { viewHeight = 0, sampleHeight = 0, groupSpacing = 5, summaryHeight = 0 }
) {
    if (!viewHeight && !sampleHeight) {
        throw new Error("viewHeight or sampleHeight must be provided!");
    }

    /** @param {Group[]} path */
    const getSampleGroup = path =>
        /** @type {import("../../sampleHandler/sampleHandler").SampleGroup} */ (peek(
            path
        ));

    const sampleGroupEntries = flattenedGroupHierarchy
        .map(path => ({
            path,
            sampleGroup: getSampleGroup(path),
            samples: getSampleGroup(path).samples
        }))
        // Skip empty groups
        .filter(entry => entry.samples.length);

    /** @type {function(string[]):import("../../utils/layout/flexLayout").SizeDef} */
    const sizeDefGenerator = sampleHeight
        ? group => ({
              px: group.length * sampleHeight + summaryHeight,
              grow: 0
          })
        : group => ({ px: summaryHeight, grow: group.length });

    /** @type {GroupLocation[]}} */
    const groupLocations = [];

    mapToPixelCoords(
        sampleGroupEntries.map(entry => sizeDefGenerator(entry.samples)),
        viewHeight,
        { spacing: groupSpacing }
    ).forEach((location, i) => {
        groupLocations.push({
            key: sampleGroupEntries[i].path,
            locSize: location
        });
    });

    /** @type {SampleLocation[]} */
    const sampleLocations = [];

    for (const [gi, entry] of sampleGroupEntries.entries()) {
        const sizeDef = { grow: 1 };
        const samples = entry.samples;
        mapToPixelCoords(
            samples.map(d => sizeDef),
            Math.max(0, groupLocations[gi].locSize.size - summaryHeight),
            {
                offset: groupLocations[gi].locSize.location + summaryHeight
            }
        ).forEach((locSize, i) => {
            const { size, location } = locSize;

            // TODO: Make padding configurable
            const padding = size * 0.1 * smoothstep(15, 22, size);

            locSize.location = location + padding;
            locSize.size = size - 2 * padding;

            sampleLocations.push({
                key: samples[i],
                locSize: locSize
            });
        });
    }

    function* extract() {
        /** @type {{group: Group, locSize: LocSize, depth: number}[]} */
        const stack = [];
        for (const entry of groupLocations) {
            const path = entry.key;
            while (
                stack.length <= path.length &&
                stack.length &&
                path[stack.length - 1] != stack[stack.length - 1].group
            ) {
                yield stack.pop();
            }

            for (let i = 0; i < stack.length; i++) {
                const stackItem = stack[i];
                stackItem.locSize.size =
                    entry.locSize.location -
                    stackItem.locSize.location +
                    entry.locSize.size;
            }

            for (let i = stack.length; i < path.length; i++) {
                stack.push({
                    group: path[i],
                    locSize: { ...entry.locSize },
                    depth: stack.length
                });
            }
        }
        while (stack.length) {
            yield stack.pop();
        }
    }

    /** @type {import("./sampleViewTypes").HierarchicalGroupLocation[]} */
    const groups = [...extract()]
        .sort((a, b) => a.depth - b.depth)
        .map((entry, index) => ({
            key: {
                index,
                group: entry.group,
                depth: entry.depth
            },
            locSize: entry.locSize
        }));

    return {
        samples: sampleLocations,
        summaries: groupLocations,
        groups
    };
}

/**
 *
 * @param {number} pos Coordinate on unit scale
 * @param {SampleLocation[]} [sampleLocations]
 */
function getSampleLocationAt(pos, sampleLocations) {
    // TODO: Matching should be done without paddings
    return sampleLocations.find(sl => locSizeEncloses(sl.locSize, pos));
}
