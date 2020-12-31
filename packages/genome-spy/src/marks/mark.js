import { group } from "d3-array";
import * as twgl from "twgl.js";
import { isDiscrete } from "vega-scale";
import { fp64ify } from "../gl/includes/fp64-utils";
import createEncoders, { isValueDef } from "../encoder/encoder";
import {
    DOMAIN_PREFIX,
    generateValueGlsl,
    generateScaleGlsl
} from "../scale/glslScaleGenerator";
import { getCachedOrCall } from "../utils/propertyCacher";
import {
    createDiscreteColorTexture,
    createSchemeTexture
} from "../scale/colorUtils";

/**
 *
 * @typedef {import("../view/view").RenderingOptions} RenderingOptions
 * @typedef {object} _MarkRenderingOptions
 * @prop {boolean} [skipViewportSetup] Don't configure viewport. Allows for
 *      optimized faceted rendering
 * @typedef {RenderingOptions & _MarkRenderingOptions} MarkRenderingOptions
 *
 * @callback DrawFunction
 * @param {import("../gl/dataToVertices").RangeEntry} range
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
        return ["x", "y", "color", "opacity"];
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
     * TODO: Replace with getter, cache it
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

        // TODO: Identical schemes could be deduped
        if (this.encoding.color && !isValueDef(this.encoding.color)) {
            const resolution = this.unitView.getScaleResolution("color");
            const props = resolution.getScaleProps();

            if (props.scheme) {
                this.rangeTexture = createSchemeTexture(props.scheme, this.gl);
            } else {
                // Assume colors specified as range
                // TODO: Continuous scales need interpolated colors
                this.rangeTexture = createDiscreteColorTexture(
                    resolution.getScale().range(),
                    this.gl
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

    /**
     *
     * @param {string} vertexShader
     * @param {string} fragmentShader
     * @param {string[]} [extraHeaders]
     */
    createShaders(vertexShader, fragmentShader, extraHeaders = []) {
        const attributes = this.getAttributes();
        const scaleGlsl = attributes
            .map(channel => {
                const fieldDef = this.encoding[channel];

                if (!fieldDef) {
                    return undefined;
                }

                if (isValueDef(fieldDef)) {
                    return generateValueGlsl(channel, fieldDef.value);
                } else {
                    const scale = this.unitView
                        .getScaleResolution(channel)
                        .getScale();
                    return generateScaleGlsl(channel, scale, fieldDef);
                }
            })
            .filter(s => s !== undefined)
            .join("\n");

        const vertexShaderWithScales = /** @type {string} */ (vertexShader).replace(
            "#pragma SCALES_HERE",
            scaleGlsl
        );

        const shaders = this.glHelper.compileShaders(
            vertexShaderWithScales,
            fragmentShader,
            extraHeaders
        );

        const program = twgl.createProgram(this.gl, shaders);

        this.programInfo = twgl.createProgramInfoFromProgram(this.gl, program);
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

    /**
     * Configures the WebGL state for rendering the mark instances.
     * A separate preparation stage allows for efficient rendering of faceted
     * views, i.e., multiple views share the uniforms (such as mark properties
     * and scales) and buffers.
     */
    prepareRender() {
        const gl = this.gl;

        if (!this.bufferInfo) {
            return;
        }

        if (!this.vertexArrayInfo) {
            this.vertexArrayInfo = twgl.createVertexArrayInfo(
                this.gl,
                this.programInfo,
                this.bufferInfo
            );
        }

        gl.useProgram(this.programInfo.program);

        /** @type {Record<string, number | number[]>} */
        const domainUniforms = {};
        for (const channel of this.getAttributes()) {
            const resolution = this.unitView.getScaleResolution(channel);
            if (resolution) {
                const scale = resolution.getScale();
                const domain = isDiscrete(scale.type)
                    ? [0, resolution.getDomain().length]
                    : resolution.getDomain();

                domainUniforms[DOMAIN_PREFIX + channel] = scale.fp64
                    ? domain.map(x => fp64ify(x)).flat()
                    : domain;
            }
        }

        if (this.rangeTexture) {
            twgl.setUniforms(this.programInfo, {
                uRangeTexture_color: this.rangeTexture
            });
        }

        twgl.setUniforms(this.programInfo, domainUniforms);

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
        if (opts) {
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
                this.programInfo.uniformSetters.uSampleFacet.location,
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

        if (this.properties.dynamicData) {
            return function renderDynamic() {
                const range = rangeMapSource().get(options.facetId);
                if (range && range.count) {
                    if (self.prepareSampleFacetRendering(options)) {
                        draw(range);
                    }
                }
            };
        } else {
            const range = rangeMapSource().get(options.facetId);
            if (range && range.count) {
                return function renderStatic() {
                    if (self.prepareSampleFacetRendering(options)) {
                        draw(range);
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
