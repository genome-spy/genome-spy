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
import { isScalar } from "../utils/variableTools.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { getConfiguredMarkDefaults } from "../config/markConfig.js";
import { validatePositionalEndpointCoordinateSpaces } from "./markUtils.js";

/**
 * @typedef {"intersects" | "encloses" | "endpoints"} HitTestMode
 * @typedef {"configuration" | "resources"} RenderingRevisionKind
 * @typedef {object} RenderingRevisionState
 * @prop {number} configuration
 * @prop {number} resources
 * @prop {Set<string>} expressions
 */

/**
 * @typedef {object} MarkDebugState
 * @prop {Record<string, any>} properties
 */

/**
 * Backend-neutral mark configuration, encoders, and data semantics. Rendering
 * backends own any retained state derived from the mark.
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

    #encodedDataRevision = 0;

    /**
     * Creates the semantic mark owned by a unit view and resolves its configured
     * property defaults.
     *
     * @param {import("../view/unitView.js").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;

        /** @type {Partial<Record<Channel, import("../types/encoder.js").Encoder>>} */
        this.encoders = undefined;

        const specProperties = /** @type {P} */ (
            typeof unitView.spec.mark == "object" ? unitView.spec.mark : {}
        );
        const properties = /** @type {P} */ (
            getConfiguredMarkDefaults(
                unitView.getConfigScopes(),
                unitView.getMarkType(),
                specProperties.style
            )
        );
        const mutableProperties = /** @type {Record<string, any>} */ (
            properties
        );
        for (const [key, value] of Object.entries(specProperties)) {
            if (value !== undefined) {
                mutableProperties[key] = value;
            }
        }

        if (properties.clip === undefined) {
            // Scale resolutions are registered after mark construction. Resolve
            // the default on first use, then make subsequent reads ordinary.
            Object.defineProperty(properties, "clip", {
                configurable: true,
                enumerable: true,
                get() {
                    const zoomableX = unitView
                        .getScaleResolution("x")
                        ?.isZoomable();
                    const zoomableY = unitView
                        .getScaleResolution("y")
                        ?.isZoomable();
                    const clip = !!(zoomableX || zoomableY);

                    Object.defineProperty(properties, "clip", {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value: clip,
                    });
                    return clip;
                },
            });
        }

        /** @type {P} */
        this.properties = properties;
    }

    /**
     * Returns the cursor definition without evaluating an expression reference.
     *
     * @returns {string | import("../spec/parameter.js").ExprRef | undefined}
     */
    getCursorSpec() {
        return this.properties.cursor;
    }

    /**
     * Returns the current cursor value in the mark's parameter scope.
     *
     * @returns {string | undefined}
     */
    getCursor() {
        const cursor = this.getCursorSpec();
        return isExprRef(cursor)
            ? this.unitView.paramRuntime.evaluateAndGet(cursor.expr)
            : cursor;
    }

    /**
     * Registers a listener for changes to an expression-backed cursor. Static
     * cursor values do not create a subscription.
     *
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

    /**
     * Returns the default interval-selection relationship for ranged mark
     * instances.
     *
     * @returns {HitTestMode}
     */
    get defaultHitTestMode() {
        return "intersects";
    }

    /**
     * Returns the encoding channels accepted by this mark. Unit views use the
     * list to discard unsupported inherited definitions, and the encoding
     * getter uses it to promote same-named scalar mark properties to value
     * definitions.
     *
     * @returns {Channel[]}
     */
    getSupportedChannels() {
        return [
            "sample",
            "facetIndex",
            "x",
            "y",
            "xOffset",
            "yOffset",
            "color",
            "opacity",
            "search",
            "tooltip",
            "uniqueId",
        ];
    }

    /**
     * Applies mark-specific defaults and normalization to a merged encoding.
     * Subclasses may mutate and return the provided object.
     *
     * @param {Encoding} encoding
     * @returns {Encoding}
     */
    fixEncoding(encoding) {
        return encoding;
    }

    /**
     * Returns the default band position for a nested discrete offset channel.
     *
     * @param {string} channel
     * @returns {number}
     * @protected
     */
    getOffsetBand(channel) {
        return 0.5;
    }

    /**
     * Tracks expression-backed properties whose changes require rebuilding
     * encoded mark data.
     *
     * @param {(keyof P)[]} props Properties to track.
     * @protected
     */
    watchEncodedDataExpressions(props) {
        for (const key of props) {
            const prop = this.properties[key];
            if (!isExprRef(prop)) {
                continue;
            }

            this.unitView.paramRuntime.watchExpression(prop.expr, () => {
                const collector = this.unitView.getCollector();
                if (!collector?.completed) {
                    return;
                }

                this.#encodedDataRevision++;
                this.unitView.context.animator.requestRender();
            });
        }
    }

    /**
     * Returns the cached normalized encoding. Automatic picking defaults, mark
     * property values, and configured encodings are merged in increasing
     * precedence before mark-specific normalization.
     *
     * @returns {Encoding}
     */
    get encoding() {
        return getCachedOrCall(this, "encoding", () => {
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
                ...(this.isPickingParticipant()
                    ? { uniqueId: { field: UNIQUE_ID_KEY } }
                    : {}),
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
                    propToValueDef(secondaryOffset),
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

            validatePositionalEndpointCoordinateSpaces(encoding);

            if (encoding.x) {
                encoding.x.buildIndex ??= this.properties.buildIndex ?? true;
            }

            return encoding;
        });
    }

    /**
     * Returns the declarative mark type owned by the unit view.
     *
     * @returns {import("../spec/mark.js").MarkType}
     */
    getType() {
        return this.unitView.getMarkType();
    }

    /**
     * Updates data-derived mark state after the collector completes.
     * Subclasses override this lifecycle hook when needed.
     *
     * @returns {void}
     */
    initializeData() {}

    /**
     * Creates channel encoders from the normalized mark encoding.
     *
     * @returns {void}
     */
    initializeEncoders() {
        this.encoders = createEncoders(this.unitView, this.encoding);
    }

    /**
     * Tracks expression and scale dependencies that retained renderers use to
     * decide whether configuration or resources must be refreshed.
     *
     * @param {Iterable<string>} resourceProperties Expression-backed properties
     *      that a retained renderer can update without rebuilding encoded data.
     * @param {{ trackResources?: boolean }} [options] Disable resource tracking
     *      when the renderer only consumes configuration revisions.
     */
    initializeRenderingRevisions(resourceProperties, options = {}) {
        const trackResources = options.trackResources ?? true;
        const previousState = this.#renderingRevisionState;
        const state =
            previousState ??
            (this.#renderingRevisionState = {
                configuration: 0,
                resources: 0,
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
                    if (isExprDef(channelDef)) {
                        watchExpression(channelDef.expr, "configuration");
                    }
                    if (!trackResources) {
                        continue;
                    }
                    if (branch.predicate?.param) {
                        watchExpression(branch.predicate.param, "resources");
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

                if (trackResources && encoder.scale) {
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

        if (!trackResources) {
            return;
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

    /**
     * Returns a renderer-facing revision, or zero before tracking is initialized.
     *
     * @param {RenderingRevisionKind} kind
     * @returns {number}
     */
    getRenderingRevision(kind) {
        return this.#renderingRevisionState?.[kind] ?? 0;
    }

    /**
     * Returns the revision of data rebuilt because an expression-backed mark
     * property changed.
     *
     * @returns {number}
     */
    getEncodedDataRevision() {
        return this.#encodedDataRevision;
    }

    /**
     * Returns whether this mark is enabled for picking throughout its layout
     * ancestry.
     *
     * @returns {boolean}
     */
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

    /**
     * Returns configured and defaulted mark properties for debug snapshots.
     *
     * @returns {MarkDebugState}
     */
    getDebugState() {
        return {
            properties: { ...this.properties },
        };
    }
}
