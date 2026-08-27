import createEncoders, {
    findChannelDefWithScale,
    isChannelWithScale,
    isDatumDef,
    isExprDef,
    isNestedDiscreteOffsetDef,
    isValueDef,
    resolveSecondaryOffset,
} from "../encoder/encoder.js";
import { getCachedOrCall } from "../utils/propertyCacher.js";
import coalesceProperties from "../utils/propertyCoalescer.js";
import { isScalar } from "../utils/variableTools.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { getConfiguredMarkDefaults } from "../config/markConfig.js";
import { validatePositionalEndpointCoordinateSpaces } from "./markUtils.js";

/**
 * @typedef {import("../types/rendering.js").ClipOptions} ClipOptions
 * @typedef {import("../types/viewContext.js").MarkRenderingOptions} MarkRenderingOptions
 * @typedef {"intersects" | "encloses" | "endpoints"} HitTestMode
 * @typedef {"configuration" | "resources"} RenderingRevisionKind
 * @typedef {object} RenderingRevisionState
 * @prop {number} configuration
 * @prop {number} resources
 * @prop {boolean} volatileResources
 * @prop {Set<string>} expressions
 */

/**
 * @typedef {object} MarkDebugState
 * @prop {boolean} markUniformsAltered
 * @prop {number | undefined} vertexCount
 * @prop {number | undefined} allocatedVertices
 * @prop {number} rangeCount
 * @prop {Record<string, any>} properties
 */

/**
 * Backend-neutral mark configuration, encoders, and data semantics. Retained
 * renderer resources live in an opaque delegate created by RendererResources.
 *
 * @template {MarkProps} [P=MarkProps]
 */
export default class Mark {
    /**
     * @typedef {import("../spec/mark.js").MarkProps} MarkProps
     * @typedef {import("../spec/channel.js").Channel} Channel
     * @typedef {import("../spec/channel.js").Encoding} Encoding
     * @typedef {import("../spec/channel.js").ValueDef} ValueDef
     */

    /** @type {RenderingRevisionState | undefined} */
    #renderingRevisionState;

    /** @type {import("../types/viewContext.js").MarkRenderingDelegate | undefined} */
    #graphics;

    /** @type {Promise<void> | undefined} */
    #graphicsInitialization;

    /**
     * @param {import("../view/unitView.js").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;
        const mark = this;

        /** @type {Partial<Record<Channel, import("../types/encoder.js").Encoder>>} */
        this.encoders = undefined;

        const configuredDefaults = getConfiguredMarkDefaults(
            this.unitView.getConfigScopes(),
            this.unitView.getMarkType(),
            typeof this.unitView.spec.mark == "object"
                ? this.unitView.spec.mark.style
                : undefined
        );

        this.defaultProperties = /** @type {P} */ ({
            get clip() {
                return getCachedOrCall(mark, "defaultClip", () => {
                    const clipX = unitView
                        .getScaleResolution("x")
                        ?.isZoomable();
                    const clipY = unitView
                        .getScaleResolution("y")
                        ?.isZoomable();

                    if (clipX && clipY) {
                        return true;
                    } else if (clipX) {
                        return "x";
                    } else if (clipY) {
                        return "y";
                    } else {
                        return false;
                    }
                });
            },
            xOffset: 0,
            yOffset: 0,
            minBufferSize: 0,
            ...configuredDefaults,
        });

        /** @type {P} */
        this.properties = coalesceProperties(
            typeof this.unitView.spec.mark == "object"
                ? () => /** @type {P} */ (this.unitView.spec.mark)
                : () => /** @type {P} */ ({}),
            () => this.defaultProperties
        );

        this.setupExprRefsNeedingGraphicsUpdate([
            "xOffset",
            "yOffset",
            "x2Offset",
            "y2Offset",
        ]);
    }

    /**
     * @param {Partial<P>} props
     * @protected
     */
    augmentDefaultProperties(props) {
        Object.defineProperties(
            this.defaultProperties,
            Object.getOwnPropertyDescriptors(props)
        );
    }

    getCursorSpec() {
        return this.properties.cursor;
    }

    getCursor() {
        const cursor = this.getCursorSpec();
        return isExprRef(cursor)
            ? this.unitView.paramRuntime.evaluateAndGet(cursor.expr)
            : cursor;
    }

    /**
     * @param {() => void} listener
     * @param {(disposer: () => void) => void} [registerDisposer]
     */
    watchCursor(listener, registerDisposer) {
        const cursor = this.getCursorSpec();
        if (!isExprRef(cursor)) {
            return;
        }

        this.unitView.paramRuntime.watchExpression(cursor.expr, listener, {
            scopeOwned: false,
            registerDisposer,
        });
    }

    get opaque() {
        return false;
    }

    /** @returns {HitTestMode} */
    get defaultHitTestMode() {
        return "intersects";
    }

    /** @returns {Channel[]} */
    getSupportedChannels() {
        return [
            "sample",
            "facetIndex",
            "x",
            "y",
            "xOffset",
            "yOffset",
            /** @type {Channel} */ ("x2Offset"),
            /** @type {Channel} */ ("y2Offset"),
            "color",
            "opacity",
            "search",
            "tooltip",
            "uniqueId",
        ];
    }

    /** @returns {Encoding} */
    getDefaultEncoding() {
        /** @type {Encoding} */
        const encoding = {
            sample: undefined,
            uniqueId: undefined,
            xOffset: { value: 0 },
            yOffset: { value: 0 },
        };

        if (this.isPickingParticipant()) {
            encoding.uniqueId = { field: UNIQUE_ID_KEY };
        }

        return encoding;
    }

    /** @param {Encoding} encoding @returns {Encoding} */
    fixEncoding(encoding) {
        return encoding;
    }

    /**
     * @param {string} channel
     * @returns {number}
     * @protected
     */
    getOffsetBand(channel) {
        return 0.5;
    }

    /**
     * @param {(keyof P)[]} props
     * @protected
     */
    setupExprRefsNeedingGraphicsUpdate(props) {
        const channels = this.getSupportedChannels();
        /** @type {Partial<MarkProps>} */
        const exprProps = {};
        for (const key of props) {
            const prop = this.properties[key];
            if (prop && isExprRef(prop)) {
                const fn = this.unitView.paramRuntime.watchExpression(
                    prop.expr,
                    () => {
                        const collector = this.unitView.getCollector();
                        if (!collector?.completed) {
                            return;
                        }

                        if (this.#graphics) {
                            this.updateGraphicsData();
                        }
                        this.unitView.context.animator.requestRender();
                    }
                );
                // @ts-ignore
                if (!channels.includes(key)) {
                    Object.defineProperty(exprProps, key, {
                        get() {
                            return fn();
                        },
                    });
                }
            }
        }
        const originalProperties = this.properties;
        // @ts-ignore
        this.properties = coalesceProperties(
            () => exprProps,
            () => originalProperties
        );
    }

    /** @returns {Encoding} */
    get encoding() {
        return getCachedOrCall(this, "encoding", () => {
            const defaults = this.getDefaultEncoding();
            const configured = this.unitView.getEncoding();

            /** @type {(property: string) => ValueDef} */
            const propToValueDef = (property) => {
                const value =
                    this.properties[/** @type {keyof MarkProps} */ (property)];
                return isScalar(value) || isExprRef(value)
                    ? { value }
                    : undefined;
            };

            const propertyValues = Object.fromEntries(
                this.getSupportedChannels()
                    .map(
                        (channel) =>
                            /** @type {[Channel, ValueDef]} */ ([
                                channel,
                                propToValueDef(channel),
                            ])
                    )
                    .filter((entry) => isValueDef(entry[1]))
            );

            const encoding = this.fixEncoding({
                ...defaults,
                ...propertyValues,
                ...configured,
            });
            const internalEncoding = /** @type {Record<string, any>} */ (
                encoding
            );

            /**
             * @param {import("../spec/channel.js").ChannelDef} channelDef
             * @param {Record<string, any>} properties
             */
            const withScaleProperties = (channelDef, properties) => {
                const clone = structuredClone(channelDef);
                const scaleDef = findChannelDefWithScale(clone);
                if (!scaleDef) {
                    throw new Error(
                        "Cannot add scale properties to an unscaled channel definition."
                    );
                }
                Object.assign(scaleDef, properties);
                return clone;
            };

            for (const primary of /** @type {const} */ (["x", "y"])) {
                const secondary = primary == "x" ? "x2" : "y2";
                const primaryOffset = primary + "Offset";
                const secondaryOffset = secondary + "Offset";
                const primaryOffsetDef = internalEncoding[primaryOffset];
                if (isNestedDiscreteOffsetDef(primaryOffsetDef)) {
                    const primaryDef = internalEncoding[primary];
                    const primaryScaleDef =
                        primaryDef && findChannelDefWithScale(primaryDef);
                    const primaryBandDef =
                        /** @type {import("../spec/channel.js").BandMixins | undefined} */ (
                            primaryScaleDef
                        );
                    if (
                        primaryScaleDef &&
                        primaryBandDef &&
                        primaryScaleDef.type != "quantitative" &&
                        primaryBandDef.band == null
                    ) {
                        internalEncoding[primary] = withScaleProperties(
                            primaryDef,
                            { band: 0 }
                        );
                    }

                    const offsetScaleDef =
                        findChannelDefWithScale(primaryOffsetDef);
                    const offsetBandDef =
                        /** @type {import("../spec/channel.js").BandMixins} */ (
                            offsetScaleDef
                        );
                    if (offsetBandDef.band == null) {
                        internalEncoding[primaryOffset] = withScaleProperties(
                            primaryOffsetDef,
                            { band: this.getOffsetBand(primaryOffset) }
                        );
                    }
                }

                const resolved = resolveSecondaryOffset(
                    internalEncoding[primaryOffset],
                    propertyValues[secondaryOffset],
                    configured[secondary] != null
                );

                if (typeof resolved == "number") {
                    internalEncoding[secondaryOffset] = { value: resolved };
                } else if (resolved && findChannelDefWithScale(resolved)) {
                    /** @type {Record<string, any>} */
                    const scaleProperties = {
                        resolutionChannel: primaryOffset,
                    };
                    if (isNestedDiscreteOffsetDef(resolved)) {
                        scaleProperties.band =
                            this.getOffsetBand(secondaryOffset);
                    }
                    internalEncoding[secondaryOffset] = withScaleProperties(
                        resolved,
                        scaleProperties
                    );
                } else {
                    internalEncoding[secondaryOffset] = resolved;
                }
            }

            for (const channel of Object.keys(encoding)) {
                if (!this.getSupportedChannels().includes(channel)) {
                    delete encoding[channel];
                }
            }

            validatePositionalEndpointCoordinateSpaces(encoding);

            if (encoding.x) {
                encoding.x.buildIndex ??= this.properties.buildIndex ?? true;
            }

            return encoding;
        });
    }

    getContext() {
        return this.unitView.context;
    }

    getType() {
        return this.unitView.getMarkType();
    }

    initializeData() {}

    initializeEncoders() {
        this.encoders = createEncoders(this.unitView, this.encoding);
    }

    /** @param {Iterable<string>} resourceProperties */
    initializeRenderingRevisions(resourceProperties) {
        const previousState = this.#renderingRevisionState;
        const state =
            previousState ??
            (this.#renderingRevisionState = {
                configuration: 0,
                resources: 0,
                volatileResources: false,
                expressions: new Set(),
            });

        /**
         * @param {string} expression
         * @param {RenderingRevisionKind} kind
         */
        const watchExpression = (expression, kind) => {
            const key = kind + ":" + expression;
            if (state.expressions.has(key)) {
                return;
            }
            this.unitView.paramRuntime.watchExpression(expression, () => {
                state[kind]++;
                this.unitView.context.animator.requestRender();
            });
            state.expressions.add(key);
        };
        if (!previousState) {
            const scales = new Set();
            for (const [channel, encoder] of Object.entries(this.encoders)) {
                for (const branch of encoder.branches ?? []) {
                    const channelDef = branch.accessor.channelDef;
                    if (branch.predicate?.param) {
                        watchExpression(branch.predicate.param, "resources");
                    }
                    if (isExprDef(channelDef)) {
                        watchExpression(channelDef.expr, "configuration");
                    }
                    const values = [
                        isValueDef(channelDef) ? channelDef.value : undefined,
                        isDatumDef(channelDef) ? channelDef.datum : undefined,
                    ];
                    for (const value of values) {
                        if (isExprRef(value)) {
                            watchExpression(value.expr, "resources");
                        }
                    }
                }

                if (encoder.scale) {
                    const channelDef = findChannelDefWithScale(
                        encoder.channelDef
                    );
                    const resolutionChannel =
                        channelDef?.resolutionChannel ?? channel;
                    if (isChannelWithScale(resolutionChannel)) {
                        const resolution =
                            this.unitView.getScaleResolution(resolutionChannel);
                        if (resolution && !scales.has(resolution)) {
                            const listener = () => state.resources++;
                            resolution.addEventListener("domain", listener);
                            resolution.addEventListener("range", listener);
                            this.unitView.registerDisposer(() => {
                                resolution.removeEventListener(
                                    "domain",
                                    listener
                                );
                                resolution.removeEventListener(
                                    "range",
                                    listener
                                );
                            });
                            scales.add(resolution);
                        }
                    }
                }
            }
        }

        for (const property of resourceProperties) {
            const value = /** @type {Record<string, any>} */ (this.properties)[
                property
            ];
            if (isExprRef(value)) {
                watchExpression(value.expr, "resources");
            }
        }
    }

    /** @param {RenderingRevisionKind} kind @returns {number | undefined} */
    getRenderingRevision(kind) {
        const state = this.#renderingRevisionState;
        if (!state) {
            return 0;
        }
        return kind == "resources" && state.volatileResources
            ? undefined
            : state[kind];
    }

    makeRenderingResourcesVolatile() {
        if (!this.#renderingRevisionState) {
            throw new Error("Rendering revisions have not been initialized.");
        }
        this.#renderingRevisionState.volatileResources = true;
    }

    async initializeGraphics() {
        const resources = this.getContext().rendererResources;
        if (!resources) {
            return;
        }
        if (!this.#graphics) {
            this.#graphics = resources.createMark(this);
            this.#graphicsInitialization = Promise.resolve(
                this.#graphics.initializeGraphics()
            );
        }
        await this.#graphicsInitialization;
    }

    finalizeGraphicsInitialization() {
        this.#graphics?.finalizeGraphicsInitialization();
    }

    updateGraphicsData() {
        this.#graphics?.updateGraphicsData();
    }

    deleteGraphicsData() {
        this.#graphics?.deleteGraphicsData();
    }

    dispose() {
        this.#graphics?.dispose();
    }

    isReady() {
        return this.#graphics?.isReady() ?? false;
    }

    /**
     * Returns the opaque delegate owned by the selected retained renderer.
     * Rendering backends resolve it while building their own command batches
     * so per-frame work does not bounce through the semantic mark.
     *
     * @returns {import("../types/viewContext.js").MarkRenderingDelegate}
     */
    getRenderingDelegate() {
        return this.#requireGraphics();
    }

    isPickingParticipant() {
        if (
            this.properties.tooltip === null &&
            !this.unitView.paramRuntime.hasPointSelections()
        ) {
            return false;
        }

        for (const view of this.unitView.getLayoutAncestors()) {
            if (!view.isPickingSupported()) {
                return false;
            }
        }

        return true;
    }

    /** @returns {MarkDebugState} */
    getDebugState() {
        const specProperties =
            typeof this.unitView.spec.mark == "object"
                ? this.unitView.spec.mark
                : {};
        const propertyKeys = new Set([
            ...Object.keys(this.defaultProperties),
            ...Object.keys(specProperties),
        ]);
        /** @type {Record<string, any>} */
        const properties = {};
        for (const key of propertyKeys) {
            properties[key] = /** @type {Record<string, any>} */ (
                this.properties
            )[key];
        }

        const graphics = this.#graphics?.getDebugState();
        return {
            markUniformsAltered: graphics?.markUniformsAltered ?? false,
            vertexCount: graphics?.vertexCount,
            allocatedVertices: graphics?.allocatedVertices,
            rangeCount: graphics?.rangeCount ?? 0,
            properties,
        };
    }

    /** @param {MarkRenderingOptions} options */
    prepareRender(options) {
        return this.#requireGraphics().prepareRender(options);
    }

    /** @param {MarkRenderingOptions} options */
    render(options) {
        return this.#requireGraphics().render(options);
    }

    /**
     * @param {{width: number, height: number}} canvasSize
     * @param {number} dpr
     * @param {import("../view/layout/rectangle.js").default} coords
     * @param {ClipOptions} [clip]
     * @param {ClipOptions} [cullClip]
     * @param {number} [pixelOffset]
     */
    setViewport(canvasSize, dpr, coords, clip, cullClip, pixelOffset) {
        return this.#requireGraphics().setViewport(
            canvasSize,
            dpr,
            coords,
            clip,
            cullClip,
            pixelOffset
        );
    }

    /**
     * @param {string} facetId
     * @param {import("../spec/channel.js").Scalar} x
     * @returns {any}
     */
    findDatumAt(facetId, x) {}

    #requireGraphics() {
        if (!this.#graphics) {
            throw new Error(
                `No retained renderer resources for mark: ${this.unitView.getPathString()}`
            );
        }
        return this.#graphics;
    }
}
