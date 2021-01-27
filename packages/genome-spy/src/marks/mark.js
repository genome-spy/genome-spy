import { group } from "d3-array";
import * as twgl from "twgl.js";
import { isDiscrete, isDiscretizing, isInterpolating } from "vega-scale";
import { fp64ify } from "../gl/includes/fp64-utils";
import createEncoders, {
    getDiscreteRangeMapper,
    isDiscreteChannel,
    isValueDef
} from "../encoder/encoder";
import {
    DOMAIN_PREFIX,
    generateValueGlsl,
    generateScaleGlsl,
    RANGE_TEXTURE_PREFIX
} from "../scale/glslScaleGenerator";
import { getCachedOrCall } from "../utils/propertyCacher";
import {
    createDiscreteColorTexture,
    createDiscreteTexture,
    createInterpolatedColorTexture,
    createSchemeTexture
} from "../scale/colorUtils";
import { isString } from "vega-util";
import { createProgram } from "../gl/webGLHelper";
import SampleView from "../view/sampleView/sampleView";

export const SAMPLE_FACET_UNIFORM = "SAMPLE_FACET_UNIFORM";
export const SAMPLE_FACET_TEXTURE = "SAMPLE_FACET_TEXTURE";

/**
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

        /** @type {twgl.BufferInfo & { allocatedVertices?: number }} WebGL buffers */
        this.bufferInfo = undefined;

        /** @type {twgl.ProgramInfo} WebGL buffers */
        this.programInfo = undefined;

        /** @type {twgl.VertexArrayInfo} WebGL buffers */
        this.vertexArrayInfo = undefined;

        /** @type {twgl.UniformBlockInfo} WebGL buffers */
        this.domainUniformInfo = undefined;

        /** @type {Map<string, WebGLTexture>} */
        this.rangeTextures = new Map();

        this.opaque = false;
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

    getSupportedChannels() {
        return ["facetIndex", "x", "y", "color", "opacity", "search"];
    }

    /**
     * @returns {import("../spec/view").Encoding}
     */
    getDefaultEncoding() {
        return {
            sample: undefined
        };
    }

    /**
     * @returns {Record<string, any>}
     */
    getDefaultProperties() {
        // TODO: Implement https://vega.github.io/vega-lite/docs/config.html
        return {
            clip: true,
            xOffset: 0,
            yOffset: 0,

            /**
             * Minimum size for WebGL buffers (number of data items).
             * Allows for using bufferSubData to update graphics.
             * This property is intended for internal usage.
             */
            minBufferSize: 0
        };
    }

    /**
     * Adds intelligent defaults etc to the encoding.
     *
     * @param {import("../spec/view").Encoding} encoding
     * @returns {import("../spec/view").Encoding}
     */
    fixEncoding(encoding) {
        return encoding;
    }

    /**
     * Returns the encoding spec supplemented with mark's default encodings
     *
     * @returns {import("../spec/view").Encoding}
     */
    get encoding() {
        return getCachedOrCall(this, "encoding", () => {
            const defaults = this.getDefaultEncoding();
            const configured = this.unitView.getEncoding();

            const channels = this.getSupportedChannels();
            const propertyValues = Object.fromEntries(
                Object.entries(this.properties)
                    .filter(
                        ([prop, value]) =>
                            channels.includes(prop) && value !== undefined
                    )
                    .map(([prop, value]) => [prop, { value }])
            );

            return this.fixEncoding({
                ...defaults,
                ...propertyValues,
                ...configured
            });
        });
    }

    /**
     * @returns {Record<string, any>}
     */
    get properties() {
        return getCachedOrCall(this, "properties", () => {
            return {
                ...this.getDefaultProperties(),
                ...(typeof this.unitView.spec.mark == "object"
                    ? this.unitView.spec.mark
                    : {})
            };
        });
    }

    getContext() {
        return this.unitView.context;
    }

    getType() {
        return this.unitView.getMarkType();
    }

    initializeData() {
        // TODO: Move this stuff to data flow or something

        const data = this.unitView.getCollectedData();

        const accessor = this.unitView.getFacetAccessor();
        if (accessor) {
            // TODO: Optimize. Now inherited data is faceted in all children.
            // Faceting should be moved to Views
            /** @type {Map<string, object[]>} */
            this.dataByFacet = group(data, accessor);
        } else {
            this.dataByFacet = new Map([[undefined, data]]);
        }
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
     * Creates textures for color schemes and discrete/discretizing ranges.
     * N.B. Discrete range textures need domain. Thus, this cannot be called
     * before the final domains are resolved.
     */
    _createRangeTextures() {
        /**
         * TODO: The count configuration logic etc should be combined
         * with scale.js that configures d3 scales using vega specs
         * @param {number} count
         * @param {any} scale
         * @returns {number}
         */
        function fixCount(count, scale) {
            if (isDiscrete(scale.type)) {
                return scale.domain().length;
            } else if (scale.type == "threshold") {
                return scale.domain().length + 1;
            } else if (scale.type == "quantize") {
                return count ?? 4;
            } else if (scale.type == "quantile") {
                return count ?? 4;
            }
            return count;
        }

        // TODO: Identical and inherited schemes could be deduped

        if (this.encoding.color && !isValueDef(this.encoding.color)) {
            const resolution = this.unitView.getScaleResolution("color");
            const props = resolution.getScaleProps();

            const scale = resolution.getScale();

            /** @type {WebGLTexture} */
            let texture;

            if (props.scheme) {
                let count = isString(props.scheme)
                    ? undefined
                    : props.scheme.count;

                count = fixCount(count, scale);

                texture = createSchemeTexture(props.scheme, this.gl, count);
            } else {
                // No scheme, assume that colors are specified in the range

                /** @type {any[]} */
                const range = scale.range();

                if (isInterpolating(scale.type)) {
                    texture = createInterpolatedColorTexture(
                        range,
                        props.interpolate,
                        this.gl
                    );
                } else {
                    texture = createDiscreteColorTexture(
                        range,
                        this.gl,
                        scale.domain().length
                    );
                }
            }

            this.rangeTextures.set("color", texture);
        }

        for (const [channel, channelDef] of Object.entries(this.encoding)) {
            if (channel === "color" || isValueDef(channelDef)) {
                continue;
            }

            const resolution = this.unitView.getScaleResolution(channel);
            if (!resolution) {
                continue;
            }

            const scale = resolution.getScale();

            if (scale.type === "ordinal" || isDiscretizing(scale.type)) {
                /** @type {function(any):number} Handle "shape" etc */
                const mapper = isDiscreteChannel(channel)
                    ? getDiscreteRangeMapper(channel)
                    : x => x;

                /** @type {any[]} */
                const range = resolution.getScale().range();

                this.rangeTextures.set(
                    channel,
                    createDiscreteTexture(
                        range.map(mapper),
                        this.gl,
                        scale.domain().length
                    )
                );
            }
        }
    }

    /**
     * Update WebGL buffers from the data
     */
    updateGraphicsData() {
        // override
    }

    _findSampleView() {
        return /** @type {SampleView} */ (this.unitView
            .getAncestors()
            .find(view => view instanceof SampleView));
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

        for (const channel of attributes) {
            const channelDef = this.encoding[channel];

            if (!channelDef) {
                continue;
            }

            if (isValueDef(channelDef)) {
                scaleCode.push(generateValueGlsl(channel, channelDef.value));
            } else {
                const scale = this.unitView
                    .getScaleResolution(channel)
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
              this.domainUniforms.map(u => `    ${u}\n`).join("") +
              "};\n\n"
            : "";

        const shaders = this.glHelper.compileShaders(
            vertexShader,
            fragmentShader,
            domainUniformBlock + scaleCode.join("\n\n"),
            extraHeaders
        );

        // Postpone status checking to allow for background compilation
        // See: https://toji.github.io/shader-perf/
        this.programStatus = createProgram(this.gl, shaders[0], shaders[1]);
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
            throw new Error("Cannot create shader program: " + error.message);
        }

        this.programInfo = twgl.createProgramInfoFromProgram(
            this.gl,
            this.programStatus.program
        );
        delete this.programStatus;

        if (this.domainUniforms.length) {
            this.domainUniformInfo = twgl.createUniformBlockInfo(
                this.gl,
                this.programInfo,
                "Domains"
            );
        }

        this._createRangeTextures();
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

            Object.values(this.bufferInfo.attribs).forEach(attribInfo =>
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
                    twgl.setAttribInfoBufferFromArray(
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
            this.bufferInfo = twgl.createBufferInfoFromArrays(
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
     * Configures the WebGL state for rendering the mark instances.
     * A separate preparation stage allows for efficient rendering of faceted
     * views, i.e., multiple views share the uniforms (such as mark properties
     * and scales) and buffers.
     */
    prepareRender() {
        const gl = this.gl;

        if (!this.vertexArrayInfo) {
            this.vertexArrayInfo = twgl.createVertexArrayInfo(
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
                const channel = uniform.substring(DOMAIN_PREFIX.length);
                const resolution = this.unitView.getScaleResolution(channel);
                if (resolution) {
                    const scale = resolution.getScale();
                    const domain = isDiscrete(scale.type)
                        ? [0, scale.domain().length]
                        : scale.domain();

                    setter(
                        scale.fp64 ? domain.map(x => fp64ify(x)).flat() : domain
                    );
                }
            }

            twgl.setUniformBlock(gl, this.programInfo, this.domainUniformInfo);
        }

        for (const [channel, texture] of this.rangeTextures.entries()) {
            twgl.setUniforms(this.programInfo, {
                [RANGE_TEXTURE_PREFIX + channel]: texture
            });
        }

        if (this.getSampleFacetMode() == SAMPLE_FACET_TEXTURE) {
            twgl.setUniforms(this.programInfo, {
                uSampleFacetTexture: this._findSampleView().facetTexture
            });
        }

        twgl.setUniforms(this.programInfo, {
            ONE: 1.0, // a hack needed by emulated 64 bit floats
            uDevicePixelRatio: this.glHelper.dpr,
            uViewOpacity: this.unitView.getEffectiveOpacity()
        });

        twgl.setUniforms(this.programInfo, {
            // left pos, left height, right pos, right height
            uSampleFacet: [0, 1, 0, 1],
            uTransitionOffset: 0.0
        });

        if (this.opaque) {
            gl.disable(gl.BLEND);
        } else {
            gl.enable(gl.BLEND);
        }
    }

    /**
     * Prepares rendering of a single sample facet. However, this must be called
     * even when no faceting is being used, i.e., when there is only a single,
     * undefined facet.
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

            drawWithRangeEntry = rangeEntry => {
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
            drawWithRangeEntry = rangeEntry =>
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
     * TODO: Viewport should be handled at the view level
     *
     * @param {import("../utils/layout/rectangle").default} coords
     */
    setViewport(coords) {
        const dpr = this.glHelper.dpr;
        const gl = this.gl;
        const props = this.properties;

        const logicalSize = this.glHelper.getLogicalCanvasSize();

        const physicalGlCoords = [
            coords.x,
            logicalSize.height - coords.y2,
            coords.width,
            coords.height
        ].map(x => x * dpr);

        // @ts-ignore

        // Note: we also handle xOffset/yOffset mark properties here
        const xOffset = props.xOffset || 0;
        const yOffset = -props.yOffset || 0;

        /** @type {object} */
        let uniforms;

        if (props.clip) {
            // Because glViewport accepts only integers, we subtract the rounding
            // errors from xyOffsets to guarantee that graphics in clipped
            // and non-clipped viewports align correctly
            const flooredCoords = physicalGlCoords.map(x => Math.floor(x));
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
                    (xOffset + xError) / coords.width,
                    -(yOffset - yError) / coords.height
                ],
                uViewScale: [1, 1]
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
                        logicalSize.height
                ],
                uViewScale: [
                    coords.width / logicalSize.width,
                    coords.height / logicalSize.height
                ]
            };
        }

        // TODO: Optimization: Use uniform buffer object
        twgl.setUniforms(this.programInfo, uniforms);

        twgl.setUniforms(this.programInfo, {
            uViewportSize: [coords.width, coords.height]
        });
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
