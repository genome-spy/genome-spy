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
import { isContinuous, isDiscrete } from "vega-scale";
import createEncoders, {
    isChannelDefWithScale,
    isChannelWithScale,
    isDatumDef,
    isFieldDef,
    isValueDef,
} from "../encoder/encoder.js";
import {
    generateConstantValueGlsl,
    generateScaleGlsl,
    RANGE_TEXTURE_PREFIX,
    isHighPrecisionScale,
    toHighPrecisionDomainUniform,
    dedupeEncodingFields,
    generateDynamicValueGlslAndUniform,
    isLargeGenome,
    splitLargeHighPrecision,
    getRangeForGlsl,
} from "../gl/glslScaleGenerator.js";
import GLSL_COMMON from "../gl/includes/common.glsl";
import GLSL_SCALES from "../gl/includes/scales.glsl";
import GLSL_SAMPLE_FACET from "../gl/includes/sampleFacet.glsl";
import GLSL_PICKING_VERTEX from "../gl/includes/picking.vertex.glsl";
import GLSL_PICKING_FRAGMENT from "../gl/includes/picking.fragment.glsl";
import { getCachedOrCall } from "../utils/propertyCacher.js";
import { createProgram } from "../gl/webGLHelper.js";
import coalesceProperties from "../utils/propertyCoalescer.js";
import { isScalar } from "../utils/variableTools.js";
import { InternMap } from "internmap";
import ViewError from "../view/viewError.js";
import { isString } from "vega-util";

export const SAMPLE_FACET_UNIFORM = "SAMPLE_FACET_UNIFORM";
export const SAMPLE_FACET_TEXTURE = "SAMPLE_FACET_TEXTURE";

/**
 *
 * @typedef {import("../types/rendering.js").RenderingOptions} RenderingOptions
 * @typedef {object} _MarkRenderingOptions
 * @prop {boolean} [skipViewportSetup] Don't configure viewport. Allows for
 *      optimized faceted rendering
 * @typedef {RenderingOptions & _MarkRenderingOptions} MarkRenderingOptions
 *
 * @callback DrawFunction
 * @param {number} offset
 * @param {number} count
 *
 */
export default class Mark {
    /**
     * @typedef {import("../spec/mark.js").MarkProps} MarkProps
     * @typedef {import("../spec/channel.js").Channel} Channel
     * @typedef {import("../spec/channel.js").Encoding} Encoding
     * @typedef {import("../spec/channel.js").ValueDef} ValueDef
     * @typedef {import("../spec/parameter.js").ExprRef} ExprRef
     */

    /**
     * Only needed during initialization;
     *
     * @type {(() => void)[]}
     */
    #callAfterShaderCompilation = [];

    /**
     * @param {import("../view/unitView.js").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;

        /** @type {Record<string, import("../types/encoder.js").Encoder>} */
        this.encoders = undefined;

        // TODO: Consolidate the following webgl stuff into a single object

        /** @type {import("twgl.js").BufferInfo & { allocatedVertices?: number }} WebGL buffers */
        this.bufferInfo = undefined;

        /** @type {import("twgl.js").ProgramInfo} WebGL buffers */
        this.programInfo = undefined;

        /** @type {import("twgl.js").VertexArrayInfo} WebGL buffers */
        this.vertexArrayInfo = undefined;

        /** @type {import("twgl.js").UniformBlockInfo} WebGL buffers */
        this.domainUniformInfo = undefined;

        /** @type {import("twgl.js").UniformBlockInfo} WebGL buffers */
        this.viewUniformInfo = undefined;

        /**
         * Uniforms related to the specific mark type.
         * @type {import("twgl.js").UniformBlockInfo}
         */
        this.markUniformInfo = undefined;

        /**
         * Indicates whether the mark's uniforms have been altered since the last rendering.
         * If set to true, the uniforms will be sent to the GPU before rendering the next frame.

         * @protected
         */
        this.markUniformsAltered = true;

        /** @type {RangeMap<any>} keep track of facet locations within the vertex array */
        this.rangeMap = new RangeMap();

        // TODO: Implement https://vega.github.io/vega-lite/docs/config.html
        /** @type {MarkProps} */
        this.defaultProperties = {
            get clip() {
                // TODO: Cache once the scales have been resolved
                // TODO: Only check channels that are used
                // TODO: provide more fine-grained xClip and yClip props
                return /** @type {import("../spec/channel.js").PositionalChannel[]} */ ([
                    "x",
                    "y",
                ])
                    .map((channel) => unitView.getScaleResolution(channel))
                    .some((resolution) => resolution?.isZoomable() ?? false);
            },
            xOffset: 0,
            yOffset: 0,

            /**
             * Minimum size for WebGL buffers (number of data items).
             * Allows for using bufferSubData to update graphics.
             * This property is intended for internal usage.
             */
            minBufferSize: 0,
        };

        /**
         * A properties object that contains the configured mark properties or
         * default values as fallback.
         *
         * TODO: Proper and comprehensive typings for mark properties
         *
         * @type {Partial<MarkProps>}
         * @readonly
         */
        this.properties = coalesceProperties(
            typeof this.unitView.spec.mark == "object"
                ? () => /** @type {MarkProps} */ (this.unitView.spec.mark)
                : () => /** @type {MarkProps} */ ({}),
            () => this.defaultProperties
        );
    }

    get opaque() {
        return false;
    }

    /**
     * Returns attribute info for WebGL attributes that match visual channels.
     *
     * Note: attributes and channels do not necessarily match.
     * For example, rectangles have x, y, x2, and y2 channels but only x and y as attributes.
     *
     * @returns {string[]}
     */
    getAttributes() {
        // override
        throw new Error("Not implemented!");
    }

    /**
     * @returns {Channel[]}
     */
    getSupportedChannels() {
        return [
            "sample",
            "facetIndex",
            "x",
            "y",
            "color",
            "opacity",
            "search",
            "uniqueId",
        ];
    }

    /**
     * @returns {Encoding}
     */
    getDefaultEncoding() {
        /** @type {Encoding} */
        const encoding = {
            sample: undefined,
            uniqueId: undefined,
        };

        if (this.isPickingParticipant()) {
            encoding.uniqueId = {
                field: "_uniqueId", // TODO: Use constant
            };
        }

        return encoding;
    }

    /**
     * Adds intelligent defaults etc to the encoding.
     *
     * @param {Encoding} encoding
     * @returns {Encoding}
     */
    fixEncoding(encoding) {
        return encoding;
    }

    /**
     * Returns the encoding spec supplemented with mark's default encodings
     *
     * @returns {Encoding}
     */
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
                            /** @type {[Channel, ValueDef] } */ ([
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

            for (const channel of Object.keys(encoding)) {
                if (!this.getSupportedChannels().includes(channel)) {
                    // TODO: Only delete channels that were inherited
                    // Should complain about unsupported channels that were
                    // explicitly specified.
                    delete encoding[channel];
                }
            }

            if (encoding.x) {
                // Building the x index is rarely necessary, but it's safer to build
                // it by default.
                encoding.x.buildIndex ??= true;
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

    initializeData() {
        //
    }

    /**
     * Initialize encoders that encode fields of the data (or constants) to
     * the ranges of the visual channels.
     */
    initializeEncoders() {
        this.encoders = createEncoders(this);
    }

    /**
     * Initialize shaders etc.
     */
    async initializeGraphics() {
        //override
    }

    /**
     * Update WebGL buffers from the data
     */
    updateGraphicsData() {
        // override
    }

    getSampleFacetMode() {
        if (this.encoders.facetIndex) {
            return SAMPLE_FACET_TEXTURE;
        } else if (
            // If the UnitView is inside app's SampleView.
            // TODO: This may break if non-faceted stuff is added to SampleView,
            // e.g., view background or an x axis.
            // This could also be more generic and work with other faceting views
            // that will be available in the future.
            this.unitView
                .getLayoutAncestors()
                .find((view) => "samples" in view.spec)
        ) {
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
    // eslint-disable-next-line complexity
    createAndLinkShaders(vertexShader, fragmentShader, extraHeaders = []) {
        const attributes = this.getAttributes();

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

        const dedupedEncodingFields = dedupeEncodingFields(this.encoders);

        const sampleFacetMode = this.getSampleFacetMode();
        if (sampleFacetMode) {
            extraHeaders.push(`#define ${sampleFacetMode}`);
        }

        /** @type {string[]} */
        const dynamicMarkUniforms = [];

        for (const attribute of attributes) {
            /** @type {Channel} */
            let channel;
            if (attribute in this.encoding) {
                channel = /** @type {Channel} */ (attribute);
            } else {
                continue;
            }

            const channelDef = this.encoding[channel];
            if (!channelDef) {
                continue;
            }

            if (isValueDef(channelDef)) {
                if (isExprRef(channelDef.value)) {
                    // An expression that evaluates to a value
                    const { uniformName, uniformGlsl, scaleGlsl, adjuster } =
                        generateDynamicValueGlslAndUniform(channel);
                    scaleCode.push(scaleGlsl);
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
                        generateConstantValueGlsl(channel, channelDef.value)
                    );
                }
            } else {
                const resolutionChannel =
                    (isChannelDefWithScale(channelDef) &&
                        channelDef.resolutionChannel) ||
                    channel;

                const scaleResolution = isChannelWithScale(resolutionChannel)
                    ? this.unitView.getScaleResolution(resolutionChannel)
                    : null;

                // Channels that share the same quantitative field
                // TODO: It should be ok to share a categorical field if the channels
                // share the same scale, e.g., primary and secondary positional channels
                const sharedChannels = isFieldDef(channelDef)
                    ? dedupedEncodingFields.get([channelDef.field, true])
                    : [channel];

                const generated = generateScaleGlsl(
                    channel,
                    scaleResolution,
                    channelDef,
                    sharedChannels?.includes(channel)
                        ? sharedChannels
                        : [channel]
                );

                scaleCode.push(generated.glsl);
                dynamicMarkUniforms.push(generated.domainUniform);
                dynamicMarkUniforms.push(generated.rangeUniform);
                attributeCode.add(generated.attributeGlsl);

                if (generated.rangeUniform) {
                    this.#callAfterShaderCompilation.push(() => {
                        const rangeSetter = this.createMarkUniformSetter(
                            generated.rangeName
                        );

                        const set = () =>
                            rangeSetter(
                                getRangeForGlsl(scaleResolution.scale, channel)
                            );
                        scaleResolution.addEventListener("range", set);

                        // Initial value
                        set();
                    });
                }

                if (generated.markUniformGlsl) {
                    if (!isDatumDef(channelDef)) {
                        throw new Error("Bug!");
                    }

                    const encoder = this.encoders[channel];

                    const indexer = encoder.indexer;
                    const hp = isHighPrecisionScale(encoder.scale.type);
                    const largeHp = hp && isLargeGenome(encoder.scale.domain());

                    /**
                     * Discrete variables both numeric and strings must be "indexed",
                     * 64 bit floats must be converted to vec2.
                     * 32 bit continuous variables go to GPU as is.
                     *
                     * @type {function(import("../spec/channel.js").Scalar):(number | number[])}
                     */
                    const adjuster = indexer
                        ? indexer
                        : largeHp
                        ? splitLargeHighPrecision
                        : (d) => +d;

                    dynamicMarkUniforms.push(generated.markUniformGlsl);

                    this.#callAfterShaderCompilation.push(() => {
                        this.registerMarkUniformValue(
                            generated.attributeName,
                            channelDef.datum,
                            adjuster
                        );
                    });
                }

                if (generated.domainUniform) {
                    this.#callAfterShaderCompilation.push(() => {
                        const domainSetter = this.createMarkUniformSetter(
                            generated.domainUniformName
                        );
                        const scale = scaleResolution.scale;
                        const set = () => {
                            const domain = isDiscrete(scale.type)
                                ? [0, scale.domain().length]
                                : scale.domain();

                            domainSetter(
                                isHighPrecisionScale(scale.type)
                                    ? toHighPrecisionDomainUniform(domain)
                                    : domain
                            );
                        };

                        scaleResolution.addEventListener("domain", set);

                        // Initial value
                        set();
                    });
                }
            }
        }

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
        const error = this.programStatus.getProgramErrors();
        if (error) {
            if (error.detail) {
                console.warn(error.detail);
            }
            /** @type {Error & { view?: import("../view/view.js").default}} */
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
            // left pos, left height, right pos, right height
            uSampleFacet: [0, 1, 0, 1],
            uTransitionOffset: 0.0,
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
        const setter = this.createMarkUniformSetter(uniformName);

        if (isExprRef(propValue)) {
            const fn = this.unitView.context.paramBroker.createExpression(
                propValue.expr
            );

            const set = () => setter(adjuster(fn(null)));

            // Register a listener ...
            fn.addListener(set);
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
        if (this.bufferInfo) {
            const gl = this.gl;
            // A hack to prevent WebGL: INVALID_OPERATION: drawArrays: no buffer is bound to enabled attribute
            // TODO: Consider using bufferSubData or DYNAMIC_DRAW etc...
            for (let i = 0; i < 8; i++) {
                gl.disableVertexAttribArray(i);
            }

            Object.values(this.bufferInfo.attribs).forEach((attribInfo) =>
                this.gl.deleteBuffer(attribInfo.buffer)
            );
            if (this.bufferInfo.indices) {
                this.gl.deleteBuffer(this.bufferInfo.indices);
            }
            this.bufferInfo = undefined;
        }
    }

    /**
     *
     * @param {any} vertexData TODO: Extract type from VertexBuilder
     */
    updateBufferInfo(vertexData) {
        // Ensure that no VAOs are inadvertently altered
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
                    // TODO: Consider double buffering:
                    // https://community.khronos.org/t/texture-buffers-are-much-slower-than-uniform-buffers/77139
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
            this.vertexArrayInfo = undefined;
        }
    }

    /** Convenience method */
    get glHelper() {
        return this.getContext().glHelper;
    }

    /** Convenience method */
    get gl() {
        return this.glHelper.gl;
    }

    onBeforeSampleAnimation() {
        // override
    }

    onAfterSampleAnimation() {
        // override
    }

    isReady() {
        return this.bufferInfo && this.programInfo;
    }

    /**
     * Returns true if this mark instance participates in picking.
     *
     * TODO: Check if tooltip is enabled,
     * TODO: Check if selection (when it's implemented) is enabled
     */
    isPickingParticipant() {
        // TODO: Should check encoding instead
        if (this.properties.tooltip === null) {
            // Disabled
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
     * @param {import("../types/rendering.js").GlobalRenderingOptions} options
     * @returns {(() => void)[]}
     */
    // eslint-disable-next-line complexity
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

        for (const [channel, channelDef] of Object.entries(this.encoding)) {
            if (isChannelDefWithScale(channelDef)) {
                const resolutionChannel =
                    (isChannelDefWithScale(channelDef) &&
                        channelDef.resolutionChannel) ||
                    channel;

                if (isChannelWithScale(resolutionChannel)) {
                    const resolution =
                        this.unitView.getScaleResolution(resolutionChannel);

                    const texture = glHelper.rangeTextures.get(resolution);
                    if (texture) {
                        ops.push(() =>
                            setUniforms(this.programInfo, {
                                [RANGE_TEXTURE_PREFIX + channel]: texture,
                            })
                        );
                    }
                }
            }
        }

        if (this.getSampleFacetMode() == SAMPLE_FACET_TEXTURE) {
            ops.push(() => {
                /** @type {WebGLTexture} */
                let facetTexture;
                for (const view of this.unitView.getLayoutAncestors()) {
                    facetTexture = view.getSampleFacetTexture();
                    if (facetTexture) {
                        break;
                    }
                }

                if (!facetTexture) {
                    throw new Error("No facet texture available. This is bug.");
                }

                setUniforms(this.programInfo, {
                    uSampleFacetTexture: facetTexture,
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
            const pos = opts.locSize ? opts.locSize.location : 0.0;
            const height = opts.locSize ? opts.locSize.size : 1.0;

            if (pos > 1.0 || pos + height < 0.0) {
                // Not visible
                return false;
            }

            const targetPos = opts.targetLocSize
                ? opts.targetLocSize.location
                : pos;
            const targetHeight = opts.targetLocSize
                ? opts.targetLocSize.size
                : height;

            // Use WebGL directly, because twgl uses gl.uniform4fv, which has an
            // inferior performance. Based on profiling, this optimization gives
            // a significant performance boost.
            this.gl.uniform4f(
                // @ts-expect-error
                locationSetter.location, // TODO: Make a twgl pull request to fix typing
                pos,
                height,
                targetPos,
                targetHeight
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
     * @param {import("./mark.js").MarkRenderingOptions} options
     */
    createRenderCallback(draw, options) {
        if (!this.bufferInfo) {
            throw new ViewError(
                `${this.getType()} mark has no data. This is bug.`,
                this.unitView
            );
        }

        // eslint-disable-next-line consistent-this
        const self = this;

        /** @type {function(import("../gl/dataToVertices.js").RangeEntry):void} rangeEntry */
        let drawWithRangeEntry;

        const scale = this.unitView.getScaleResolution("x")?.scale;
        const continuous = scale && isContinuous(scale.type);
        const domainStartOffset = ["index", "locus"].includes(scale?.type)
            ? -1
            : 0;

        /** @type {[number, number]} Recycle to ease garbage collector's work */
        const arr = [0, 0];

        drawWithRangeEntry = (rangeEntry) => {
            if (continuous && rangeEntry.xIndex) {
                const domain = scale.domain();
                const vertexIndices = rangeEntry.xIndex(
                    domain[0] + domainStartOffset,
                    domain[1],
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
     * @param {import("../view/layout/rectangle.js").default} coords
     * @param {import("../view/layout/rectangle.js").default} [clipRect]
     * @returns {boolean} true if the viewport is renderable (size > 0)
     */
    setViewport(coords, clipRect) {
        coords = coords.flatten();

        const dpr = this.unitView.context.devicePixelRatio;
        const gl = this.gl;
        const props = this.properties;

        const logicalSize = this.glHelper.getLogicalCanvasSize();

        // Translate by half a pixel to place vertical / horizontal
        // rules inside pixels, not between pixels.
        const pixelOffset = 0.5;

        // Note: we also handle xOffset/yOffset mark properties here
        const xOffset = (props.xOffset ?? 0) + pixelOffset;
        const yOffset = (props.yOffset ?? 0) + pixelOffset;

        /** @type {object} */
        let uniforms;

        let clippedCoords = coords;

        if (props.clip !== "never" && (props.clip || clipRect)) {
            let xClipOffset = 0;
            let yClipOffset = 0;

            /** @type {[number, number]} */
            let uViewScale;

            if (clipRect) {
                // The following fails with axes that are handled by a GridView
                // that itself is scrollable. The axes are clipped to the viewport
                // but also to the axis view, resulting in clipped axes where
                // not necessary.
                clippedCoords = coords.intersect(clipRect).flatten();
                if (!clippedCoords.isDefined()) {
                    return false;
                }

                uViewScale = [
                    coords.width / clippedCoords.width,
                    coords.height / clippedCoords.height,
                ];

                yClipOffset = Math.max(0, coords.y2 - clipRect.y2);
                xClipOffset = Math.min(0, coords.x - clipRect.x);
            } else {
                uViewScale = [1, 1];
            }

            const physicalGlCoords = [
                clippedCoords.x,
                logicalSize.height - clippedCoords.y2,
                clippedCoords.width,
                clippedCoords.height,
            ].map((x) => x * dpr);

            // Because glViewport accepts only integers, we subtract the rounding
            // errors from xyOffsets to guarantee that graphics in clipped
            // and non-clipped viewports align correctly
            const roundedCoords = physicalGlCoords.map((x) => Math.round(x));
            const [xError, yError] = physicalGlCoords.map(
                (x, i) => x - roundedCoords[i]
            );

            // @ts-ignore
            gl.viewport(...roundedCoords);
            // @ts-ignore
            gl.scissor(...roundedCoords);
            gl.enable(gl.SCISSOR_TEST);

            uniforms = {
                uViewOffset: [
                    (xOffset + xClipOffset + xError / dpr) /
                        clippedCoords.width,
                    -(yOffset + yClipOffset - yError / dpr) /
                        clippedCoords.height,
                ],
                uViewScale,
            };
        } else {
            if (!coords.isDefined()) {
                return false;
            }

            // Viewport comprises the full canvas
            gl.viewport(
                0,
                0,
                logicalSize.width * dpr,
                logicalSize.height * dpr
            );
            gl.disable(gl.SCISSOR_TEST);

            // Offset and scale all drawing to the view rectangle
            uniforms = {
                uViewOffset: [
                    (coords.x + xOffset) / logicalSize.width,
                    (logicalSize.height - coords.y - yOffset - coords.height) /
                        logicalSize.height,
                ],
                uViewScale: [
                    coords.width / logicalSize.width,
                    coords.height / logicalSize.height,
                ],
            };
        }

        setBlockUniforms(this.viewUniformInfo, {
            ...uniforms,
            uViewportSize: [coords.width, coords.height],
            uDevicePixelRatio: dpr,
        });

        setUniformBlock(this.gl, this.programInfo, this.viewUniformInfo);

        return true;
    }

    /**
     * Finds a datum that overlaps the given value on the x domain.
     * The result is unspecified if multiple data are found.
     *
     * This is highly specific to SampleView and its sorting/filtering functionality.
     *
     * @param {string} facetId
     * @param {import("../spec/channel.js").Scalar} x value on the x domain
     * @returns {any}
     */
    findDatumAt(facetId, x) {
        // override
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
        for (const [key, value] of anotherMap.entries()) {
            Object.assign(this.get(key), value);
        }
    }
}

// TODO: Find a better place for this function
/**
 * @param {any} x
 * @returns {x is import("../spec/parameter.js").ExprRef}
 */
export function isExprRef(x) {
    return typeof x == "object" && x != null && "expr" in x && isString(x.expr);
}
