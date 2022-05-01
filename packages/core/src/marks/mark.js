import {
    createBufferInfoFromArrays,
    createProgramInfoFromProgram,
    createUniformBlockInfo,
    createVertexArrayInfo,
    setAttribInfoBufferFromArray,
    setUniformBlock,
    setUniforms,
} from "twgl.js";
import { isDiscrete } from "vega-scale";
import createEncoders, {
    isChannelDefWithScale,
    isDatumDef,
    isValueDef,
} from "../encoder/encoder";
import {
    DOMAIN_PREFIX,
    generateValueGlsl,
    generateScaleGlsl,
    RANGE_TEXTURE_PREFIX,
    ATTRIBUTE_PREFIX,
    isHighPrecisionScale,
    toHighPrecisionDomainUniform,
    splitHighPrecision,
} from "../scale/glslScaleGenerator";
import GLSL_COMMON from "../gl/includes/common.glsl";
import GLSL_SCALES from "../gl/includes/scales.glsl";
import GLSL_SAMPLE_FACET from "../gl/includes/sampleFacet.glsl";
import GLSL_PICKING_VERTEX from "../gl/includes/picking.vertex.glsl";
import GLSL_PICKING_FRAGMENT from "../gl/includes/picking.fragment.glsl";
import { getCachedOrCall } from "../utils/propertyCacher";
import { createProgram } from "../gl/webGLHelper";
import coalesceProperties from "../utils/propertyCoalescer";
import { isScalar } from "../utils/variableTools";

export const SAMPLE_FACET_UNIFORM = "SAMPLE_FACET_UNIFORM";
export const SAMPLE_FACET_TEXTURE = "SAMPLE_FACET_TEXTURE";

/**
 * @typedef {import("../spec/mark").MarkConfig} MarkConfig
 * @typedef {import("../spec/channel").Channel} Channel
 * @typedef {import("../spec/channel").Encoding} Encoding
 * @typedef {import("../spec/channel").ValueDef} ValueDef
 *
 * @typedef {import("../view/view").RenderingOptions} RenderingOptions
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
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        this.unitView = unitView;

        /** @type {Record<string, import("../encoder/encoder").Encoder>} */
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

        // TODO: Implement https://vega.github.io/vega-lite/docs/config.html
        /** @type {MarkConfig} */
        this.defaultProperties = {
            get clip() {
                // TODO: Cache once the scales have been resolved
                // TODO: Only check channels that are used
                // TODO: provide more fine-grained xClip and yClip props
                return /** @type {Channel[]} */ (["x", "y"])
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
         * @type {Partial<MarkConfig>}
         * @readonly
         */
        this.properties = coalesceProperties(
            typeof this.unitView.spec.mark == "object"
                ? () => /** @type {MarkConfig} */ (this.unitView.spec.mark)
                : () => /** @type {MarkConfig} */ ({}),
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
                    this.properties[/** @type {keyof MarkConfig} */ (property)];
                return isScalar(value) && { value };
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
                    .filter((entry) => entry[1].value !== undefined)
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
        } else if (this.unitView.getFacetAccessor()) {
            return SAMPLE_FACET_UNIFORM;
        }
    }

    /**
     *
     * @param {string} vertexShader
     * @param {string} fragmentShader
     * @param {string[]} [extraHeaders]
     */
    createAndLinkShaders(vertexShader, fragmentShader, extraHeaders = []) {
        const attributes = this.getAttributes();

        // For debugging
        extraHeaders.push("// view: " + this.unitView.getPathString());

        // TODO: This is a temporary variable, don't store it in the mark object
        /** @type {string[]} */
        this.domainUniforms = [];

        /** @type {string[]} */
        let scaleCode = [];

        const sampleFacetMode = this.getSampleFacetMode();
        if (sampleFacetMode) {
            extraHeaders.push(`#define ${sampleFacetMode}`);
        }

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
                scaleCode.push(generateValueGlsl(channel, channelDef.value));
            } else {
                const resolutionChannel =
                    (isChannelDefWithScale(channelDef) &&
                        channelDef.resolutionChannel) ||
                    channel;

                const scale = this.unitView
                    .getScaleResolution(resolutionChannel)
                    .getScale();

                const generated = generateScaleGlsl(channel, scale, channelDef);

                scaleCode.push(generated.glsl);
                if (generated.domainUniform) {
                    this.domainUniforms.push(generated.domainUniform);
                }
            }
        }

        const domainUniformBlock = this.domainUniforms.length
            ? "layout(std140) uniform Domains {\n" +
              this.domainUniforms.map((u) => `    ${u}\n`).join("") +
              "};\n\n"
            : "";

        const vertexPrecision = "precision highp float;\n";

        const vertexParts = [
            vertexPrecision,
            ...extraHeaders,
            GLSL_COMMON,
            GLSL_SCALES,
            domainUniformBlock,
            ...scaleCode,
            GLSL_SAMPLE_FACET,
            GLSL_PICKING_VERTEX,
            vertexShader,
        ];

        const fragmentParts = [
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
     */
    finalizeGraphicsInitialization() {
        const error = this.programStatus.getProgramErrors();
        if (error) {
            if (error.detail) {
                console.warn(error.detail);
            }
            /** @type {Error & { view?: import("../view/view").default}} */
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

        if (this.domainUniforms.length) {
            this.domainUniformInfo = createUniformBlockInfo(
                this.gl,
                this.programInfo,
                "Domains"
            );
        }

        this.gl.useProgram(this.programInfo.program);

        this._setDatums();
    }

    _setDatums() {
        for (const [channel, channelDef] of Object.entries(this.encoding)) {
            if (isDatumDef(channelDef)) {
                const encoder = this.encoders[channel];

                const datum = encoder.indexer
                    ? encoder.indexer(channelDef.datum)
                    : isHighPrecisionScale(encoder.scale.type)
                    ? splitHighPrecision(+channelDef.datum)
                    : +channelDef.datum;

                setUniforms(this.programInfo, {
                    [ATTRIBUTE_PREFIX + channel]: datum,
                });
            }
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

        for (const view of this.unitView.getAncestors()) {
            if (!view.isPickingSupported()) {
                return false;
            }
        }

        return true;
    }

    /**
     * Configures the WebGL state for rendering the mark instances.
     * A separate preparation stage allows for efficient rendering of faceted
     * views, i.e., multiple views share the uniforms (such as mark properties
     * and scales) and buffers.
     *
     * @param {import("../view/rendering").GlobalRenderingOptions} options
     */
    // eslint-disable-next-line complexity
    prepareRender(options) {
        const glHelper = this.glHelper;
        const gl = this.gl;

        if (!this.vertexArrayInfo) {
            this.vertexArrayInfo = createVertexArrayInfo(
                this.gl,
                this.programInfo,
                this.bufferInfo
            );
        }

        gl.useProgram(this.programInfo.program);

        if (this.domainUniformInfo) {
            // TODO: Only update the domains that have changed

            for (const [uniform, setter] of Object.entries(
                this.domainUniformInfo.setters
            )) {
                // TODO: isChannel()
                const channel = /** @type {Channel} */ (
                    uniform.substring(DOMAIN_PREFIX.length)
                );

                const channelDef = this.encoding[channel];
                const resolutionChannel =
                    (isChannelDefWithScale(channelDef) &&
                        channelDef.resolutionChannel) ||
                    channel;
                const resolution =
                    this.unitView.getScaleResolution(resolutionChannel);

                if (resolution) {
                    const scale = resolution.getScale();
                    const domain = isDiscrete(scale.type)
                        ? [0, scale.domain().length]
                        : scale.domain();

                    setter(
                        isHighPrecisionScale(scale.type)
                            ? toHighPrecisionDomainUniform(domain)
                            : domain
                    );
                }
            }

            setUniformBlock(gl, this.programInfo, this.domainUniformInfo);
        }

        for (const [channel, channelDef] of Object.entries(this.encoding)) {
            if (isChannelDefWithScale(channelDef)) {
                const resolutionChannel =
                    (isChannelDefWithScale(channelDef) &&
                        channelDef.resolutionChannel) ||
                    channel;

                const resolution =
                    this.unitView.getScaleResolution(resolutionChannel);

                const texture = glHelper.rangeTextures.get(resolution);
                if (texture) {
                    setUniforms(this.programInfo, {
                        [RANGE_TEXTURE_PREFIX + channel]: texture,
                    });
                }
            }
        }

        if (this.getSampleFacetMode() == SAMPLE_FACET_TEXTURE) {
            /** @type {WebGLTexture} */
            let facetTexture;
            for (const view of this.unitView.getAncestors()) {
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
        }

        setUniforms(this.programInfo, {
            uDevicePixelRatio: this.glHelper.dpr,
            uViewOpacity: this.unitView.getEffectiveOpacity(),
            // TODO: Rendering of the mark should be completely skipped if it doesn't
            // participate picking
            uPickingEnabled:
                (options.picking ?? false) && this.isPickingParticipant(),
        });

        setUniforms(this.programInfo, {
            // left pos, left height, right pos, right height
            uSampleFacet: [0, 1, 0, 1],
            uTransitionOffset: 0.0,
        });

        if (this.opaque || options.picking) {
            gl.disable(gl.BLEND);
        } else {
            gl.enable(gl.BLEND);
        }
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
     * @param {import("./Mark").MarkRenderingOptions} options
     * @param {function():Map<string, import("../gl/dataToVertices").RangeEntry>} rangeMapSource
     */
    createRenderCallback(draw, options, rangeMapSource) {
        // eslint-disable-next-line consistent-this
        const self = this;

        /** @type {function(import("../gl/dataToVertices").RangeEntry):void} rangeEntry */
        let drawWithRangeEntry;

        if (this.properties.buildIndex) {
            const scale = this.unitView.getScaleResolution("x")?.getScale();

            drawWithRangeEntry = (rangeEntry) => {
                if (scale && rangeEntry.xIndex) {
                    const domain = scale.domain();
                    const vertexIndices = rangeEntry.xIndex(
                        domain[0],
                        domain[1]
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
        } else {
            drawWithRangeEntry = (rangeEntry) =>
                draw(rangeEntry.offset, rangeEntry.count);
        }

        if (this.properties.dynamicData) {
            return function renderDynamic() {
                const rangeEntry = rangeMapSource().get(options.facetId);
                if (rangeEntry && rangeEntry.count) {
                    if (self.prepareSampleFacetRendering(options)) {
                        drawWithRangeEntry(rangeEntry);
                    }
                }
            };
        } else {
            const rangeEntry = rangeMapSource().get(options.facetId);
            if (rangeEntry && rangeEntry.count) {
                return function renderStatic() {
                    if (self.prepareSampleFacetRendering(options)) {
                        drawWithRangeEntry(rangeEntry);
                    }
                };
            }
        }
    }

    /**
     * Sets viewport, clipping, and uniforms related to scaling and translation
     *
     * @param {import("../utils/layout/rectangle").default} coords
     * @param {import("../utils/layout/rectangle").default} [clipRect]
     * @returns {boolean} true if the viewport is renderable (size > 0)
     */
    setViewport(coords, clipRect) {
        const dpr = this.glHelper.dpr;
        const gl = this.gl;
        const props = this.properties;

        const logicalSize = this.glHelper.getLogicalCanvasSize();

        // Translate by half a pixel to place vertical / horizontal
        // rules inside pixels, not between pixels.
        const pixelOffset = 0.5;

        // Note: we also handle xOffset/yOffset mark properties here
        const xOffset = (props.xOffset || 0) + pixelOffset;
        const yOffset = (props.yOffset || 0) + pixelOffset;

        /** @type {object} */
        let uniforms;

        let clippedCoords = coords;

        if (props.clip || clipRect) {
            let xClipOffset = 0;
            let yClipOffset = 0;

            /** @type {[number, number]} */
            let uViewScale;

            if (clipRect) {
                clippedCoords = props.clip
                    ? coords.intersect(clipRect)
                    : clipRect;

                uViewScale = [
                    coords.width / clippedCoords.width,
                    coords.height / clippedCoords.height,
                ];

                yClipOffset = Math.max(0, coords.y2 - clipRect.y2);
                xClipOffset = Math.max(0, coords.x2 - clipRect.x2); // TODO: Check sign
            } else {
                uViewScale = [1, 1];
            }

            const physicalGlCoords = [
                coords.x,
                logicalSize.height - clippedCoords.y2,
                Math.max(0, clippedCoords.width),
                Math.max(0, clippedCoords.height),
            ].map((x) => x * dpr);

            // Because glViewport accepts only integers, we subtract the rounding
            // errors from xyOffsets to guarantee that graphics in clipped
            // and non-clipped viewports align correctly
            const flooredCoords = physicalGlCoords.map((x) => Math.floor(x));
            const [xError, yError] = physicalGlCoords.map(
                (x, i) => x - flooredCoords[i]
            );

            // @ts-ignore
            gl.viewport(...flooredCoords);
            // @ts-ignore
            gl.scissor(...flooredCoords);
            gl.enable(gl.SCISSOR_TEST);

            uniforms = {
                uViewOffset: [
                    (xOffset + xClipOffset + xError) / clippedCoords.width,
                    -(yOffset + yClipOffset - yError) / clippedCoords.height,
                ],
                uViewScale,
            };
        } else {
            // Viewport comprises of the full canvas
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

        // TODO: Optimization: Use uniform buffer object
        setUniforms(this.programInfo, uniforms);

        setUniforms(this.programInfo, {
            uViewportSize: [coords.width, coords.height],
        });

        // TODO: Optimize: don't set viewport and stuff if rect is outside clipRect or screen

        return clippedCoords.height > 0 && clippedCoords.width > 0;
    }

    /**
     * Finds a datum that overlaps the given value on the x domain.
     * The result is unspecified if multiple data are found.
     *
     * This is highly specific to SampleView and its sorting/filtering functionality.
     *
     * @param {string} facetId
     * @param {number} x position on the x domain
     * @returns {any}
     */
    findDatumAt(facetId, x) {
        // override
    }
}
