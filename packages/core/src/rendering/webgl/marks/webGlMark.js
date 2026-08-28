import {
    bindUniformBlock,
    createBufferInfoFromArrays,
    createProgramInfoFromProgram,
    createUniformBlockInfo,
    createVertexArrayInfo,
    setAttribInfoBufferFromArray,
    setBlockUniforms,
    setUniformBlock,
    setUniforms,
} from "twgl.js";
import { isContinuous, isDiscrete, isDiscretizing } from "vega-scale";
import {
    dedupeEncodingFields,
    generateConditionalEncoderGlsl,
    generateConstantValueGlsl,
    generateDataGlsl,
    generateDatumGlslAndUniform,
    generateDynamicValueGlslAndUniform,
    generateScaleGlsl,
    getAttributeAndArrayTypes,
    getDiscretizingDomainForGlsl,
    getRangeForGlsl,
    makeAttributeName,
    PARAM_PREFIX,
    RANGE_TEXTURE_PREFIX,
    SELECTION_CHECKER_PREFIX,
    splitLargeHighPrecision,
    toHighPrecisionDomainUniform,
} from "../gl/glslScaleGenerator.js";
import {
    findChannelDefWithScale,
    getSecondaryChannel,
    isChannelWithScale,
    isDatumDef,
    isExprDef,
    isFieldDef,
    isValueDef,
} from "../../../encoder/encoder.js";
import { isIndexLikeDomainType } from "../../../scales/indexLikeDomainUtils.js";
import GLSL_COMMON from "../gl/includes/common.glsl";
import GLSL_SCALES from "../gl/includes/scales.glsl";
import GLSL_SAMPLE_FACET from "../gl/includes/sampleFacet.glsl";
import GLSL_PICKING_VERTEX from "../gl/includes/picking.vertex.glsl";
import GLSL_PICKING_FRAGMENT from "../gl/includes/picking.fragment.glsl";
import { createProgram } from "../gl/webGLHelper.js";
import { RASTER_COORDINATE_OFFSET } from "../../renderingConstants.js";
import { InternMap } from "internmap";
import ViewError from "../../../view/viewError.js";
import {
    isExprRef,
    validateParameterName,
} from "../../../paramRuntime/paramUtils.js";
import {
    isIntervalSelection,
    isMultiPointSelection,
    isSinglePointSelection,
} from "../../../selection/selection.js";

const SAMPLE_FACET_UNIFORM = "SAMPLE_FACET_UNIFORM";
const SAMPLE_FACET_TEXTURE = "SAMPLE_FACET_TEXTURE";
const SELECTION_TEXTURE_PREFIX = "uSelectionTexture_";

/**
 * Returns a conservative horizontal pixel bound for indexed rendering.
 * Undefined means that a data-dependent pass-through offset is unbounded and
 * the x index must not be used for culling.
 *
 * @param {Partial<Record<string, import("../../../types/encoder.js").Encoder>>} encoders
 * @returns {number | undefined}
 */
export function getXIndexOffsetBound(encoders) {
    let bound = 0;

    for (const channel of ["xOffset", "x2Offset", "dx"]) {
        const encoder = encoders[channel];
        if (!encoder) {
            continue;
        }

        if (encoder.constant) {
            const value = encoder(/** @type {any} */ ({}));
            if (!Number.isFinite(value)) {
                return undefined;
            }
            bound = Math.max(bound, Math.abs(/** @type {number} */ (value)));
        } else if (encoder.scale && encoder.scale.type !== "null") {
            const range = encoder.scale.range();
            if (!range.every((value) => Number.isFinite(value))) {
                return undefined;
            }
            bound = Math.max(
                bound,
                ...range.map((value) => Math.abs(/** @type {number} */ (value)))
            );
        } else {
            return undefined;
        }
    }

    return bound;
}

/**
 * @typedef {import("../../../types/rendering.js").ClipOptions} ClipOptions
 * @typedef {import("../../../view/layout/rectangle.js").default} Rectangle
 * @typedef {import("../types.js").WebGLMarkRenderingOptions} MarkRenderingOptions
 * @typedef {import("../../../spec/channel.js").Channel} Channel
 * @typedef {import("../../../spec/parameter.js").ExprRef} ExprRef
 * @typedef {object} MarkDebugState
 * @prop {boolean} markUniformsAltered
 * @prop {number | undefined} vertexCount
 * @prop {number | undefined} allocatedVertices
 * @prop {number} rangeCount
 * @callback DrawFunction
 * @param {number} offset
 * @param {number} count
 */

export default class WebGLMark {
    /** @type {(() => void)[]} */
    #callAfterShaderCompilation = [];

    #disposed = false;

    /**
     * @param {import("../../../marks/mark.js").default} mark
     * @param {import("../gl/webGLHelper.js").default} glHelper
     * @param {import("../rendererResources.js").default} [rendererResources]
     */
    constructor(mark, glHelper, rendererResources) {
        this.mark = mark;
        this._glHelper = glHelper;
        this._rendererResources = rendererResources;

        /** @type {import("twgl.js").BufferInfo & {allocatedVertices?: number} | undefined} */
        this.bufferInfo = undefined;

        /** @type {Map<string, number>} */
        this.bytesPerElement = new Map();

        /** @type {import("twgl.js").ProgramInfo | undefined} */
        this.programInfo = undefined;

        /** @type {import("twgl.js").VertexArrayInfo | undefined} */
        this.vertexArrayInfo = undefined;

        /** @type {import("twgl.js").UniformBlockInfo | undefined} */
        this.viewUniformInfo = undefined;

        /** @type {import("twgl.js").UniformBlockInfo | undefined} */
        this.markUniformInfo = undefined;

        this.markUniformsAltered = true;

        /** @type {(() => void)[]} */
        this.selectionTextureOps = [];

        this.rangeMap = new RangeMap();
    }

    get unitView() {
        return this.mark.unitView;
    }

    get encoders() {
        return this.mark.encoders;
    }

    get encoding() {
        return this.mark.encoding;
    }

    /** @returns {any} */
    get properties() {
        return this.mark.properties;
    }

    get font() {
        return /** @type {any} */ (this.mark).font;
    }

    get opaque() {
        return this.mark.opaque;
    }

    get defaultHitTestMode() {
        return this.mark.defaultHitTestMode;
    }

    getContext() {
        return this.mark.getContext();
    }

    getType() {
        return this.mark.getType();
    }

    /** @returns {Channel[]} */
    getAttributes() {
        throw new Error("Not implemented.");
    }

    initializeGraphics() {
        this.#assertActive();
    }

    getSampleFacetMode() {
        if (this.encoders.facetIndex) {
            return SAMPLE_FACET_TEXTURE;
        } else if (this.unitView.usesSampleFacetRendering()) {
            return SAMPLE_FACET_UNIFORM;
        }
    }

    /**
     *
     * @param {string} vertexShader
     * @param {string} fragmentShader
     * @param {string[]} [extraHeaders]
     * @protected
     */
    createAndLinkShaders(vertexShader, fragmentShader, extraHeaders = []) {
        const shaderChannels = this.getAttributes();
        const encoders = this.encoders;
        const sampleFacetMode = this.getSampleFacetMode();
        const useVisibleRangeCulling = Boolean(
            this.properties.cullByVisibleRange
        );
        if (sampleFacetMode) {
            extraHeaders.push(`#define ${sampleFacetMode}`);
        }
        if (useVisibleRangeCulling) {
            extraHeaders.push("#define VISIBLE_RANGE_CULLING");
        }

        // For debugging
        const debugHeader = "// view: " + this.unitView.getPathString();

        /** @type {string[]} */
        let scaleCode = [];

        /**
         * Attribute definitions. Using set to prevent duplicates caused by
         * multiple channels using the same shared quantitative field.
         * @type {Set<string>}
         */
        const attributeCode = new Set();

        const dedupedEncodingFields = dedupeEncodingFields(encoders);

        /** @type {string[]} */
        const dynamicMarkUniforms = [];

        const paramPredicates = Object.values(encoders)
            .flatMap((e) => e.branches ?? [])
            .map((branch) => branch.predicate)
            .filter((p) => p.param);

        /**
         * Prevent duplicate registration.
         * @type {Map<string, "single" | "multi" | "interval">}
         */
        const selectionParameterUniforms = new Map();

        for (const predicate of paramPredicates) {
            const param = predicate.param;
            const paramRuntime = this.unitView.paramRuntime;
            const selection = paramRuntime.findValue(param);

            // The selection is supposed to have an empty value at this point
            // so that we can figure out the type of the selection.
            if (!selection) {
                throw new Error(
                    `Cannot infer selection type as the parameter "${param}" has no value. Please ensure that the parameter is properly defined!`
                );
            }

            const uniqueIdAttr = makeAttributeName("uniqueId");

            if (isSinglePointSelection(selection)) {
                // Register a mark uniform for each param. The uniform will have
                // the value of uniqueId of the selected datum.
                if (!selectionParameterUniforms.has(param)) {
                    selectionParameterUniforms.set(param, "single");

                    const uniformName =
                        PARAM_PREFIX + validateParameterName(param);

                    dynamicMarkUniforms.push(`    // Selection parameter`);
                    dynamicMarkUniforms.push(
                        `    uniform highp uint ${uniformName};`
                    );
                    this.#callAfterShaderCompilation.push(() => {
                        this.registerMarkUniformValue(
                            uniformName,
                            { expr: param },
                            (
                                /** @type {import("../../../types/selectionTypes.js").SinglePointSelection} */ selection
                            ) => selection.uniqueId ?? 0
                        );
                    });
                    scaleCode.push(
                        `bool ${SELECTION_CHECKER_PREFIX}${param}(bool empty) {\n` +
                            `    return ${PARAM_PREFIX}${param} == ${uniqueIdAttr} || (empty && ${PARAM_PREFIX}${param} == 0u);\n` +
                            `}`
                    );
                }
            } else if (isMultiPointSelection(selection)) {
                // We need a texture for each multi-selection parameter.
                // The texture stores an open-addressing hash table of selected uniqueIds.
                if (!selectionParameterUniforms.has(param)) {
                    selectionParameterUniforms.set(param, "multi");

                    const uniformName =
                        SELECTION_TEXTURE_PREFIX + validateParameterName(param);
                    scaleCode.push(
                        `// Selection texture\nuniform highp usampler2D ${uniformName};`
                    );

                    const glHelper = this.glHelper;
                    const selectionTextures = glHelper.selectionTextures;

                    this.selectionTextureOps.push(() => {
                        // Texture is set in the prepareRender method
                        const selection = paramRuntime.getValue(param);
                        const texture = selectionTextures.get(selection);
                        if (!texture) {
                            throw new Error(
                                `Bug: no selection texture found for "${param}"!`
                            );
                        }

                        setUniforms(this.programInfo, {
                            [uniformName]: texture,
                        });
                    });

                    const texName = SELECTION_TEXTURE_PREFIX + param;
                    scaleCode.push(
                        `bool ${SELECTION_CHECKER_PREFIX}${param}(bool empty) {\n` +
                            `   return hashContainsTexture(${texName}, ${uniqueIdAttr}) || (empty && isEmptyHashTexture(${texName}));\n` +
                            `}`
                    );

                    // Create the initial texture
                    glHelper.createSelectionTexture(selection);

                    paramRuntime.watchExpression(param, () => {
                        const selection =
                            /** @type {import("../../../types/selectionTypes.js").MultiPointSelection} */ (
                                paramRuntime.getValue(param)
                            );
                        glHelper.createSelectionTexture(selection);
                        this.getContext().animator.requestRender();
                    });
                }
            } else if (isIntervalSelection(selection)) {
                if (!selectionParameterUniforms.has(param)) {
                    selectionParameterUniforms.set(param, "interval");

                    /** @type {string[]} */
                    const testSnippets = [];

                    /** @type {string[]} */
                    const emptySnippets = [];

                    // Handle both channels separately
                    for (const channel of Object.keys(selection.intervals)) {
                        if (!["x", "y"].includes(channel)) {
                            continue;
                        }

                        const uniformName =
                            PARAM_PREFIX +
                            validateParameterName(param) +
                            `_${channel}`;

                        // TODO: High precision scales
                        const { attributeType } = getAttributeAndArrayTypes(
                            this.unitView
                                .getScaleResolution(channel)
                                .getScale(),
                            channel
                        );

                        dynamicMarkUniforms.push(`    // Selection parameter`);
                        dynamicMarkUniforms.push(
                            `    uniform highp ${attributeType}[2] ${uniformName};`
                        );
                        this.#callAfterShaderCompilation.push(() => {
                            this.registerMarkUniformValue(
                                uniformName,
                                { expr: param },
                                (
                                    /** @type {import("../../../types/selectionTypes.js").IntervalSelection} */ selection
                                ) => selection.intervals[channel] ?? [1, 0]
                            );
                        });

                        const getAttributeName = (
                            /** @type {Channel} */ channel
                        ) => {
                            for (const [
                                k,
                                channels,
                            ] of dedupedEncodingFields.entries()) {
                                if (k[1] && channels.includes(channel)) {
                                    return makeAttributeName(channels);
                                }
                            }
                            return makeAttributeName(channel);
                        };

                        const c = getAttributeName(channel);
                        const u = uniformName + "[0]";
                        const u2 = uniformName + "[1]";
                        const secondaryChannel = getSecondaryChannel(channel);
                        if (this.encoding[secondaryChannel]) {
                            const c2 = getAttributeName(secondaryChannel);
                            const mode = this.defaultHitTestMode;
                            if (mode == "endpoints") {
                                testSnippets.push(
                                    `((${u} <= ${c} && ${c} <= ${u2}) || (${u} <= ${c2} && ${c2} <= ${u2}))`
                                );
                            } else if (mode == "encloses") {
                                testSnippets.push(
                                    `(${u} <= ${c} && ${c2} <= ${u2})`
                                );
                            } else if (mode == "intersects") {
                                testSnippets.push(
                                    `(${u} <= ${c2} && ${c} <= ${u2})`
                                );
                            } else {
                                throw new ViewError(
                                    `Unsupported hit test mode "${mode}" for interval selection!`,
                                    this.unitView
                                );
                            }
                        } else {
                            testSnippets.push(
                                `(${u} <= ${c} && ${c} <= ${u2})`
                            );
                        }

                        emptySnippets.push(`${u} > ${u2}`);
                    }

                    scaleCode.push(
                        `bool ${SELECTION_CHECKER_PREFIX}${param}(bool empty) {\n` +
                            `    return ${testSnippets.join(" && ")} || (empty && (${emptySnippets.join(" || ")}));\n` +
                            `}`
                    );
                }
            }
        }

        /**
         * @param {Channel} channel
         * @param {import("../../../types/encoder.js").Accessor} accessor
         * @param {number} conditionNumber
         * @param {import("../../../types/encoder.js").VegaScale} scale
         */
        const addAccessor = (channel, accessor, conditionNumber, scale) => {
            const channelDef = accessor.channelDef;

            if (isValueDef(channelDef)) {
                if (isExprRef(channelDef.value)) {
                    // An expression that evaluates to a value
                    const { uniformName, uniformGlsl, accessorGlsl, adjuster } =
                        generateDynamicValueGlslAndUniform(
                            channel,
                            conditionNumber
                        );
                    scaleCode.push(accessorGlsl);
                    dynamicMarkUniforms.push(uniformGlsl);

                    this.#callAfterShaderCompilation.push(() => {
                        this.registerMarkUniformValue(
                            uniformName,
                            channelDef.value,
                            adjuster
                        );
                    });
                } else {
                    // A constant value
                    scaleCode.push(
                        generateConstantValueGlsl(
                            channel,
                            conditionNumber,
                            channelDef.value
                        ).accessorGlsl
                    );
                }
            } else if (isDatumDef(channelDef)) {
                const { uniformName, uniformGlsl, accessorGlsl } =
                    generateDatumGlslAndUniform(
                        channel,
                        scale,
                        conditionNumber
                    );

                dynamicMarkUniforms.push(uniformGlsl);
                scaleCode.push(accessorGlsl);

                const { largeHp, discrete } = getAttributeAndArrayTypes(
                    scale,
                    channel
                );

                /**
                 * Discrete variables both numeric and strings must be "indexed",
                 * 64 bit floats must be converted to vec2.
                 * 32 bit continuous variables go to GPU as is.
                 *
                 * @type {function(import("../../../spec/channel.js").Scalar):(number | number[])}
                 */
                const adjuster =
                    discrete && "domain" in scale
                        ? (d) => scale.domain().indexOf(d)
                        : largeHp
                          ? splitLargeHighPrecision
                          : (d) => +d;

                this.#callAfterShaderCompilation.push(() => {
                    this.registerMarkUniformValue(
                        uniformName,
                        channelDef.datum,
                        adjuster
                    );
                });
            } else if (isFieldDef(channelDef)) {
                const dedupedChannels = dedupedEncodingFields.get([
                    channelDef.field,
                    true,
                ]);
                const { attributeGlsl, accessorGlsl } = generateDataGlsl(
                    channel,
                    scale,
                    conditionNumber,
                    dedupedChannels?.includes(channel)
                        ? dedupedChannels
                        : undefined
                );
                attributeCode.add(attributeGlsl);
                scaleCode.push(accessorGlsl);
            } else if (isExprDef(channelDef)) {
                const { attributeGlsl, accessorGlsl } = generateDataGlsl(
                    channel,
                    scale,
                    conditionNumber
                );
                attributeCode.add(attributeGlsl);
                scaleCode.push(accessorGlsl);
            } else {
                throw new ViewError(
                    `Unsupported channel definition: ${JSON.stringify(
                        channelDef
                    )}`,
                    this.unitView
                );
            }
        };

        for (const [channel, encoder] of Object.entries(encoders)) {
            if (!shaderChannels.includes(channel)) {
                continue;
            }

            const { branches, channelDef, scale } = encoder;

            // Generate accessors, one for each condition -------------

            for (let i = 0; i < branches.length; i++) {
                addAccessor(channel, branches[i].accessor, i, scale);
            }

            // Generate scale if needed -------------------------------

            if (scale) {
                const channelDefWithScale = findChannelDefWithScale(channelDef);
                const resolutionChannel =
                    (channelDefWithScale &&
                        channelDefWithScale.resolutionChannel) ||
                    channel;

                // TODO: The event listener should be in the scale, not the resolution
                const scaleResolution = isChannelWithScale(resolutionChannel)
                    ? this.unitView.getScaleResolution(resolutionChannel)
                    : null;

                const {
                    glsl,
                    domainUniform,
                    domainUniformName,
                    rangeUniform,
                    rangeUniformName,
                } = generateScaleGlsl(channel, scale, channelDef);

                scaleCode.push(glsl);
                dynamicMarkUniforms.push(domainUniform);
                dynamicMarkUniforms.push(rangeUniform);

                if (rangeUniform) {
                    this.#callAfterShaderCompilation.push(() => {
                        const rangeSetter =
                            this.createMarkUniformSetter(rangeUniformName);

                        const set = () =>
                            rangeSetter(getRangeForGlsl(scale, channel));
                        // TODO: The event listener should be in the scale, not the resolution
                        scaleResolution.addEventListener("range", set);

                        // Initial value
                        set();
                    });
                }

                if (domainUniform) {
                    this.#callAfterShaderCompilation.push(() => {
                        const domainSetter =
                            this.createMarkUniformSetter(domainUniformName);
                        const set = () => {
                            let domain;
                            if (isDiscrete(scale.type)) {
                                domain = [0, scale.domain().length];
                            } else if (isDiscretizing(scale.type)) {
                                domain = getDiscretizingDomainForGlsl(scale);
                            } else {
                                domain = scale.domain();
                            }

                            domainSetter(
                                isIndexLikeDomainType(scale.type)
                                    ? toHighPrecisionDomainUniform(domain)
                                    : domain
                            );
                        };

                        // TODO: The event listener should be in the scale, not the resolution
                        scaleResolution.addEventListener("domain", set);

                        // Initial value
                        set();
                    });
                }
            }

            // Generate conditional encoder -------------------------------

            scaleCode.push(generateConditionalEncoderGlsl(channel, branches));
        }

        // Generate a function that checks if the datum is subject to any point selection
        const conditions = [...selectionParameterUniforms.keys()].map(
            (param) => `${SELECTION_CHECKER_PREFIX}${param}(false)`
        );

        scaleCode.push(
            "bool isPointSelected() {\n" +
                (this.encoders.uniqueId && conditions.length > 0
                    ? `    return ${conditions.join(" || ")};`
                    : "    return false;") +
                "\n}"
        );

        const vertexPrecision = "precision highp float;\nprecision highp int;";

        /**
         * @param {string} shaderCode
         */
        const addDynamicMarkUniforms = (shaderCode) =>
            shaderCode.replace(
                "#pragma markUniforms",
                dynamicMarkUniforms.join("\n")
            );

        extraHeaders = extraHeaders.map(addDynamicMarkUniforms);
        vertexShader = addDynamicMarkUniforms(vertexShader);
        fragmentShader = addDynamicMarkUniforms(fragmentShader);

        const vertexParts = [
            vertexPrecision,
            debugHeader,
            ...extraHeaders,
            GLSL_COMMON,
            GLSL_SCALES,
            [...attributeCode].join("\n"),
            ...scaleCode,
            GLSL_SAMPLE_FACET,
            GLSL_PICKING_VERTEX,
            vertexShader,
        ];

        const fragmentParts = [
            vertexPrecision,
            debugHeader,
            ...extraHeaders,
            GLSL_COMMON,
            GLSL_PICKING_FRAGMENT,
            fragmentShader,
        ];

        const gl = this.gl;

        // Postpone status checking to allow for background compilation
        // See: https://toji.github.io/shader-perf/
        // TODO: It might make sense to cache and share identical programs between mark instances.
        this.programStatus = createProgram(
            gl,
            this.glHelper.compileShader(gl.VERTEX_SHADER, vertexParts),
            this.glHelper.compileShader(gl.FRAGMENT_SHADER, fragmentParts)
        );
    }

    /**
     * Check WebGL shader/program compilation/linking status and finalize
     * initialization.
     *
     * This is done as a separate step after all shader compilations have been
     * initiated. The idea is to allow for parallel background compilation.
     */
    finalizeGraphicsInitialization() {
        this.#assertActive();
        // Allow duplicate finalization calls when multiple init paths overlap.
        if (this.programInfo) {
            return;
        }

        if (!this.programStatus) {
            throw new Error(
                "No program status found! " + this.unitView.getPathString()
            );
        }

        const error = this.programStatus.getProgramErrors();
        if (error) {
            if (error.detail) {
                console.warn(error.detail);
            }
            /** @type {Error & { view?: import("../../../view/view.js").default}} */
            const err = new Error(
                "Cannot create shader program: " + error.message
            );
            err.view = this.unitView;
            throw err;
        }

        this.programInfo = createProgramInfoFromProgram(
            this.gl,
            this.programStatus.program
        );
        delete this.programStatus;

        this.viewUniformInfo = createUniformBlockInfo(
            this.gl,
            this.programInfo,
            "View"
        );

        this.markUniformInfo = createUniformBlockInfo(
            this.gl,
            this.programInfo,
            "Mark"
        );

        this.gl.useProgram(this.programInfo.program);

        setUniforms(this.programInfo, {
            uSampleFacet: [0, 1],
            uZero: 0.0,
        });

        for (const fn of this.#callAfterShaderCompilation) {
            fn();
        }
        this.#callAfterShaderCompilation = undefined;
    }

    /**
     * Sets a uniform in the Mark block. Requests a render from the animator.
     *
     * @protected
     * @param {string} uniformName
     * @returns {function(any):void}
     */
    createMarkUniformSetter(uniformName) {
        const uniformSetter = this.markUniformInfo.setters[uniformName];
        if (!uniformSetter) {
            throw new Error(
                `Uniform "${uniformName}" not found int the Mark block!`
            );
        }

        return (value) => {
            uniformSetter(value);
            this.markUniformsAltered = true;
            this.unitView.context.animator.requestRender();
        };
    }

    /**
     * Set a uniform based on a mark property. If the property is an expression,
     * register a listener to update the uniform when the params referenced by the
     * expression change.
     *
     * @protected
     * @template T
     * @param {string} uniformName
     * @param {T} propValue
     * @param {(x: Exclude<T, ExprRef>) => any} adjuster
     */
    registerMarkUniformValue(uniformName, propValue, adjuster = (x) => x) {
        const rawSetter = this.createMarkUniformSetter(uniformName);
        const setter = (/** @type {any} */ value) => {
            if (value == null) {
                throw new Error(
                    `Trying to set null/undefined value for uniform: ${uniformName}${
                        isExprRef(propValue) ? `Expr: ${propValue.expr}` : ""
                    }`
                );
            }
            rawSetter(value);
        };

        if (isExprRef(propValue)) {
            /** @type {import("../../../paramRuntime/types.js").ExprRefFunction} */
            let fn;
            const set = () => setter(adjuster(fn(null)));
            fn = this.unitView.paramRuntime.watchExpression(
                propValue.expr,
                set
            );

            // ... and set the initial value
            set();
        } else {
            setter(adjuster(/** @type {Exclude<T, ExprRef>} */ (propValue)));
        }
    }

    /**
     * Delete WebGL buffers etc.
     */
    deleteGraphicsData() {
        const gl = this.gl;

        if (this.vertexArrayInfo) {
            this.gl.bindVertexArray(null);
            gl.deleteVertexArray(this.vertexArrayInfo.vertexArrayObject);
            this.vertexArrayInfo = undefined;
        }

        if (this.bufferInfo) {
            Object.values(this.bufferInfo.attribs).forEach((attribInfo) =>
                this.gl.deleteBuffer(attribInfo.buffer)
            );
            if (this.bufferInfo.indices) {
                this.gl.deleteBuffer(this.bufferInfo.indices);
            }
            this.bufferInfo = undefined;
        }
    }

    dispose() {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        this.deleteGraphicsData();

        if (this.viewUniformInfo) {
            this.gl.deleteBuffer(this.viewUniformInfo.buffer);
            this.viewUniformInfo = undefined;
        }
        if (this.markUniformInfo) {
            this.gl.deleteBuffer(this.markUniformInfo.buffer);
            this.markUniformInfo = undefined;
        }
        const program =
            this.programInfo?.program ?? this.programStatus?.program;
        if (program) {
            this.gl.deleteProgram(program);
        }
        this.programInfo = undefined;
        this.programStatus = undefined;
    }

    #assertActive() {
        if (this.#disposed) {
            throw new Error("WebGL mark resources have been disposed.");
        }
    }

    /**
     *
     * @param {any} vertexData TODO: Extract type from VertexBuilder
     */
    updateBufferInfo(vertexData) {
        this.gl.bindVertexArray(null);

        if (
            this.bufferInfo &&
            vertexData.vertexCount <= this.bufferInfo.allocatedVertices
        ) {
            for (const [attribute, attributeData] of Object.entries(
                vertexData.arrays
            )) {
                // Skip constants
                if (attributeData.data) {
                    // TODO: Check that all attributes and numComponents match
                    setAttribInfoBufferFromArray(
                        this.gl,
                        this.bufferInfo.attribs[attribute],
                        attributeData.data,
                        0
                    );
                }
            }
        } else {
            this.deleteGraphicsData();
            this.bufferInfo = createBufferInfoFromArrays(
                this.gl,
                vertexData.arrays,
                { numElements: vertexData.vertexCount }
            );
            this.bufferInfo.allocatedVertices = vertexData.allocatedVertices;

            for (const [attribute, attributeData] of Object.entries(
                vertexData.arrays
            )) {
                this.bytesPerElement.set(
                    attribute,
                    attributeData.data.BYTES_PER_ELEMENT
                );
            }
        }
    }

    /** Convenience method */
    get glHelper() {
        return this._glHelper;
    }

    get rendererResources() {
        if (!this._rendererResources) {
            throw new Error("WebGL renderer resources are not available.");
        }
        return this._rendererResources;
    }

    /** Convenience method */
    get gl() {
        return this.glHelper.gl;
    }

    isReady() {
        return !!(this.bufferInfo && this.programInfo);
    }

    isPickingParticipant() {
        return this.mark.isPickingParticipant();
    }

    /** @returns {MarkDebugState} */
    getDebugState() {
        return {
            markUniformsAltered: this.markUniformsAltered,
            vertexCount: this.bufferInfo?.numElements,
            allocatedVertices: this.bufferInfo?.allocatedVertices,
            rangeCount: this.rangeMap.size,
        };
    }

    /**
     * @protected
     */
    bindOrSetMarkUniformBlock() {
        if (this.markUniformsAltered) {
            setUniformBlock(this.gl, this.programInfo, this.markUniformInfo);
            this.markUniformsAltered = false;
        } else {
            bindUniformBlock(this.gl, this.programInfo, this.markUniformInfo);
        }
    }

    /**
     * Configures the WebGL state for rendering the mark instances.
     * A separate preparation stage allows for efficient rendering of faceted
     * views, i.e., multiple views share the uniforms (such as mark properties
     * and scales) and buffers.
     *
     * @param {MarkRenderingOptions} options
     * @returns {(() => void)[]}
     */
    prepareRender(options) {
        const glHelper = this.glHelper;
        const gl = this.gl;

        /** @type {(() => void)[]} */
        const ops = [];

        ops.push(() => {
            if (!this.vertexArrayInfo) {
                this.vertexArrayInfo = createVertexArrayInfo(
                    this.gl,
                    this.programInfo,
                    this.bufferInfo
                );
            }

            gl.useProgram(this.programInfo.program);
        });

        for (const [channel, encoder] of Object.entries(this.encoders)) {
            const texture = glHelper.rangeTextures.get(encoder.scale);
            if (texture) {
                ops.push(() =>
                    setUniforms(this.programInfo, {
                        [RANGE_TEXTURE_PREFIX + channel]: texture,
                    })
                );
            }
        }

        ops.push(...this.selectionTextureOps);

        if (this.getSampleFacetMode() == SAMPLE_FACET_TEXTURE) {
            ops.push(() => {
                const source = options.placement?.source;
                if (!source) {
                    throw new Error("No placement source available.");
                }

                setUniforms(this.programInfo, {
                    uSampleFacetTexture:
                        this.glHelper.getPlacementTexture(source),
                });
            });
        }

        // TODO: Rendering of the mark should be completely skipped if it doesn't
        // participate picking
        const picking =
            (options.picking ?? false) && this.isPickingParticipant();

        // Note: the block is sent to GPU in setViewport(), which is repeated for each facet
        ops.push(() =>
            setBlockUniforms(this.viewUniformInfo, {
                uViewOpacity: this.unitView.getEffectiveOpacity(),
                uPickingEnabled: picking,
            })
        );

        if (this.opaque || options.picking) {
            ops.push(() => gl.disable(gl.BLEND));
        } else {
            ops.push(() => gl.enable(gl.BLEND));
        }

        return ops;
    }

    /**
     * Prepares rendering of a single sample facet.
     *
     * @param {MarkRenderingOptions} options
     * @returns {boolean} true if rendering should proceed,
     *      false if it should be skipped
     */
    prepareSampleFacetRendering(options) {
        const opts = options.sampleFacetRenderingOptions;
        const locationSetter = this.programInfo.uniformSetters.uSampleFacet;

        if (opts && locationSetter) {
            const scale = opts.pixelToUnit;
            const pos = opts.locSize.location * scale;
            const height = opts.locSize.size * scale;

            if (pos > 1.0 || pos + height < 0.0) {
                // Not visible
                return false;
            }

            // Use WebGL directly, because twgl uses gl.uniform2fv, which has an
            // inferior performance. Based on profiling, this optimization gives
            // a significant performance boost.
            this.gl.uniform2f(
                // @ts-expect-error
                locationSetter.location, // TODO: Make a twgl pull request to fix typing
                pos,
                height
            );
        }

        return true;
    }

    /**
     * Returns a callback function that the ViewRenderingContext calls to
     * perform the actual rendering either immediately or at a later time.
     *
     * @param {MarkRenderingOptions} options
     * @returns {function():void} A function that renderingContext calls to
     *      trigger the actual rendering
     */
    render(options) {
        // Override
        return undefined;
    }

    /**
     * @param {DrawFunction} draw A function that draws a range of vertices
     * @param {MarkRenderingOptions} options
     * @returns {function():void}
     */
    createRenderCallback(draw, options) {
        if (!this.bufferInfo) {
            // This happens if the layout is computed before the data flow has propagated.
            // However, it's not a big deal, because this will be called again at the end
            // of the initialization process.

            // Return no operation
            return () => undefined;
        }

        const self = this;

        /** @type {function(import("../gl/dataToVertices.js").RangeEntry):void} rangeEntry */
        let drawWithRangeEntry;

        const scale = this.unitView.getScaleResolution("x")?.getScale();
        const continuous = scale && isContinuous(scale.type);
        const offsetBound = getXIndexOffsetBound(
            /** @type {Partial<Record<string, import("../../../types/encoder.js").Encoder>>} */ (
                this.encoders
            )
        );
        const domainStartOffset = ["index", "locus"].includes(scale?.type)
            ? -1
            : 0;
        const offsetPerPixel =
            continuous && offsetBound > 0 && Number.isFinite(offsetBound)
                ? offsetBound /
                  (this.unitView.getScaleResolution("x").getAxisLength() || 1)
                : 0;

        /** @type {[number, number]} Recycle to ease garbage collector's work */
        const arr = [0, 0];

        drawWithRangeEntry = (rangeEntry) => {
            if (continuous && rangeEntry.xIndex && offsetBound !== undefined) {
                const domain = scale.domain();
                const offsetDomainMargin =
                    Math.abs(domain[1] - domain[0]) * offsetPerPixel;
                const vertexIndices = rangeEntry.xIndex(
                    domain[0] + domainStartOffset - offsetDomainMargin,
                    domain[1] + offsetDomainMargin,
                    arr
                );
                const offset = vertexIndices[0];
                const count = vertexIndices[1] - offset;
                if (count > 0) {
                    draw(offset, count);
                }
            } else {
                draw(rangeEntry.offset, rangeEntry.count);
            }
        };

        // If is either faceted or non-faceted, not both.
        // An undefined key with vertices means that the mark is non-faceted.
        // In such case, the same non-faceted data is repeated for each facet.
        const facetId =
            this.rangeMap.get(undefined).count == 0
                ? options.facetId
                : undefined;
        const rangeEntry = this.rangeMap.get(facetId);

        return options.sampleFacetRenderingOptions
            ? function renderSampleFacetRange() {
                  if (rangeEntry.count) {
                      if (self.prepareSampleFacetRendering(options)) {
                          drawWithRangeEntry(rangeEntry);
                      }
                  }
              }
            : function renderRange() {
                  if (rangeEntry.count) {
                      drawWithRangeEntry(rangeEntry);
                  }
              };
    }

    /**
     * Sets viewport, clipping, and uniforms related to scaling and translation
     *
     * @param {{width: number, height: number}} canvasSize Size of the canvas in logical pixels
     * @param {number} dpr Device pixel ratio
     * @param {import("../../../view/layout/rectangle.js").default} coords
     * @param {ClipOptions} [clip]
     * @param {ClipOptions} [cullClip]
     * @param {number} [pixelOffset]
     * @returns {boolean} true if the viewport is renderable (size > 0)
     */
    setViewport(
        canvasSize,
        dpr,
        coords,
        clip,
        cullClip,
        pixelOffset = RASTER_COORDINATE_OFFSET
    ) {
        coords = coords.flatten();

        const gl = this.gl;
        const props = this.properties;

        const xOffset = pixelOffset;
        const yOffset = pixelOffset;

        /** @type {object} */
        let uniforms;

        const viewportScope = createViewportScope(
            canvasSize,
            coords,
            props.clip === "never" ? undefined : clip,
            false
        );
        const scopedCoords = viewportScope.coords;

        if (viewportScope.requiresScissor) {
            if (!scopedCoords.isDefined()) {
                return false;
            }

            const physicalGlCoords = [
                scopedCoords.x,
                canvasSize.height - scopedCoords.y2,
                scopedCoords.width,
                scopedCoords.height,
            ].map((x) => x * dpr);

            // Because glViewport accepts only integers, we subtract the rounding
            // errors from xyOffsets to guarantee that graphics in clipped
            // and non-clipped viewports align correctly
            const roundedCoords =
                /** @type {[number, number, number, number]} */ (
                    physicalGlCoords.map((x) => Math.floor(x))
                );
            const xError = physicalGlCoords[0] - roundedCoords[0];
            const yError = physicalGlCoords[1] - roundedCoords[1];

            gl.viewport(...roundedCoords);
            gl.scissor(...roundedCoords);
            gl.enable(gl.SCISSOR_TEST);

            uniforms = {
                uViewOffset: [
                    (coords.x - scopedCoords.x + xOffset + xError / dpr) /
                        scopedCoords.width,
                    (scopedCoords.y2 - coords.y2 - yOffset + yError / dpr) /
                        scopedCoords.height,
                ],
                uViewScale: [
                    coords.width / scopedCoords.width,
                    coords.height / scopedCoords.height,
                ],
            };
        } else {
            if (!coords.isDefined()) {
                return false;
            }

            // Viewport comprises the full canvas
            gl.viewport(
                0,
                0,
                Math.round(canvasSize.width * dpr),
                Math.round(canvasSize.height * dpr)
            );
            gl.disable(gl.SCISSOR_TEST);

            // Offset and scale all drawing to the view rectangle
            uniforms = {
                uViewOffset: [
                    (coords.x + xOffset) / canvasSize.width,
                    (canvasSize.height - coords.y - yOffset - coords.height) /
                        canvasSize.height,
                ],
                uViewScale: [
                    coords.width / canvasSize.width,
                    coords.height / canvasSize.height,
                ],
            };
        }

        setBlockUniforms(this.viewUniformInfo, {
            ...uniforms,
            uViewportSize: [coords.width, coords.height],
            uLogicalVisibleRect: createLogicalVisibleRect(coords, cullClip),
            uCullByVisibleRange: [
                props.cullByVisibleRange === true ||
                props.cullByVisibleRange === "x"
                    ? 1
                    : 0,
                props.cullByVisibleRange === true ||
                props.cullByVisibleRange === "y"
                    ? 1
                    : 0,
            ],
            uDevicePixelRatio: dpr,
        });

        setUniformBlock(this.gl, this.programInfo, this.viewUniformInfo);

        return true;
    }
}

/**
 * @augments {InternMap<K, import("../gl/dataToVertices.js").RangeEntry>}
 * @template K
 */
class RangeMap extends InternMap {
    constructor() {
        super([], JSON.stringify);
    }

    /**
     * @param {K} key
     */
    get(key) {
        let value = super.get(key);
        if (value === undefined) {
            value = {
                offset: 0,
                count: 0,
                xIndex: undefined,
            };
            super.set(key, value);
        }
        return value;
    }

    /**
     *
     * @param {Map<K, import("../gl/dataToVertices.js").RangeEntry>} anotherMap
     */
    migrateEntries(anotherMap) {
        for (const [key, value] of this.entries()) {
            // Buffered draw calls maintain direct references to the range entries.
            // Thus, they cannot just be deleted, but instead, their counts and offsets
            // must be zeroed.
            if (!anotherMap.has(key)) {
                value.offset = 0;
                value.count = 0;
                value.xIndex = undefined;
            }
        }

        for (const [key, value] of anotherMap.entries()) {
            Object.assign(this.get(key), value);
        }
    }
}

/**
 * @param {{ width: number, height: number }} canvasSize
 * @param {Rectangle} coords
 * @param {ClipOptions | undefined} clip
 * @param {boolean} [clipSelf]
 */
export function createViewportScope(canvasSize, coords, clip, clipSelf = true) {
    if (!clip || (!clip.clipX && !clip.clipY)) {
        return {
            requiresScissor: false,
            coords,
        };
    }

    let clippedCoords = clipSelf ? coords.intersect(clip.rect) : clip.rect;

    if (!clip.clipX) {
        clippedCoords = clippedCoords.modify({
            x: 0,
            width: canvasSize.width,
        });
    }

    if (!clip.clipY) {
        clippedCoords = clippedCoords.modify({
            y: 0,
            height: canvasSize.height,
        });
    }

    return {
        requiresScissor: true,
        coords: clippedCoords.flatten(),
    };
}

/**
 * @param {Rectangle} coords
 * @param {ClipOptions | undefined} clip
 * @returns {[number, number, number, number]}
 */
export function createLogicalVisibleRect(coords, clip) {
    const x1 = clip?.clipX ? (clip.rect.x - coords.x) / coords.width : 0;
    const x2 = clip?.clipX ? (clip.rect.x2 - coords.x) / coords.width : 1;
    const y1 = clip?.clipY ? (coords.y2 - clip.rect.y2) / coords.height : 0;
    const y2 = clip?.clipY ? (coords.y2 - clip.rect.y) / coords.height : 1;

    return [x1, y1, x2, y2];
}
