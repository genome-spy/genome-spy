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
            ...configuredDefaults,
        });

        /** @type {P} */
        this.properties = coalesceProperties(
            typeof this.unitView.spec.mark == "object"
                ? () => /** @type {P} */ (this.unitView.spec.mark)
                : () => /** @type {P} */ ({}),
            () => this.defaultProperties
        );

        this.setupExprRefsNeedingEncodedDataUpdate([
            "xOffset",
            "yOffset",
            "x2Offset",
            "y2Offset",
        ]);
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
        const encoding = {};

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
    setupExprRefsNeedingEncodedDataUpdate(props) {
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

                        this.#encodedDataRevision++;
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

            validatePositionalEndpointCoordinateSpaces(encoding);

            if (encoding.x) {
                encoding.x.buildIndex ??= this.properties.buildIndex ?? true;
            }

            return encoding;
        });
    }

    getType() {
        return this.unitView.getMarkType();
    }

    initializeData() {}

    initializeEncoders() {
        this.encoders = createEncoders(this.unitView, this.encoding);
    }

    /**
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

    /** @param {RenderingRevisionKind} kind @returns {number} */
    getRenderingRevision(kind) {
        return this.#renderingRevisionState?.[kind] ?? 0;
    }

    getEncodedDataRevision() {
        return this.#encodedDataRevision;
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

        return {
            properties,
        };
    }
}
