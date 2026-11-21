import {
    createProgramInfoFromProgram,
    createTexture,
    setUniforms,
} from "twgl.js";
import { readNumericRasterCell } from "../../../data/rasterTile.js";
import clamp from "../../../utils/clamp.js";
import ViewError from "../../../view/viewError.js";
import { createVisibleBounds } from "../../immediate/bounds.js";
import {
    SampleFacetCoordsResolver,
    visitMarkOccurrences,
} from "../../immediate/markData.js";
import { encodeNumber } from "../../immediate/markEncoding.js";
import { visitRasterTiles } from "../../immediate/marks/raster.js";
import { RASTER_COORDINATE_OFFSET } from "../../renderingConstants.js";
import { readScaleDomainUniform } from "../gl/glslScaleGenerator.js";
import { createProgram } from "../gl/webGLHelper.js";
import VERTEX_SHADER from "./raster.vertex.glsl";
import { rasterFragmentShader } from "./rasterShader.js";

/** @typedef {{texture: WebGLTexture, width: number, height: number}} TileTexture */
/** @typedef {import("../types.js").WebGLMarkRenderingOptions} MarkRenderingOptions */

/** @typedef {import("../types.js").WebGLMark} WebGLMark */

/** @implements {WebGLMark} */
export default class WebGLRasterMark {
    /** @type {Map<object, TileTexture>} */
    #tiles = new Map();

    /** @type {ReturnType<typeof createProgram>} */
    #programStatus;

    /** @type {import("twgl.js").ProgramInfo} */
    #programInfo;

    /** @type {ReturnType<import("../../../marks/raster.js").default["validateRenderingScales"]>} */
    #color;

    /** @type {import("../../../view/layout/rectangle.js").default} */
    #coords;

    #sampleFacetCoords = new SampleFacetCoordsResolver();

    #bounds = createVisibleBounds(0, 0, undefined);

    #dpr = 1;
    #pixelOffset = 0;
    #viewOpacity = 1;

    /** @type {ReturnType<import("../../../marks/raster.js").default["getCellOpacityReader"]>} */
    #readCellOpacity;

    #target = [0, 0];
    #tileUniforms = {
        uRect: [0, 0, 0, 0],
        uAnchor: [0, 0, 0, 0],
        uCellsPerPixel: [0, 0],
        uTriangle: [0, 0],
        uTriangleClip: [0, 0, 0, 0],
        uCells: /** @type {WebGLTexture | null} */ (null),
        uOpacity: 1,
    };

    /**
     * @param {import("../../../marks/mark.js").default} mark
     * @param {import("../gl/webGLHelper.js").default} glHelper
     * @param {import("../rendererResources.js").default} resources
     */
    constructor(mark, glHelper, resources) {
        this.mark = /** @type {import("../../../marks/raster.js").default} */ (
            mark
        );
        this.glHelper = glHelper;
        this.gl = glHelper.gl;
        this.resources = resources;
    }

    initializeGraphics() {
        this.#color = this.mark.validateRenderingScales();
        this.mark.initializeRenderingRevisions([]);
        this.#readCellOpacity = this.mark.getCellOpacityReader();
        const gl = this.gl;
        this.#programStatus = createProgram(
            gl,
            this.glHelper.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER),
            this.glHelper.compileShader(
                gl.FRAGMENT_SHADER,
                rasterFragmentShader(this.mark, this.#color?.getScale())
            )
        );
    }

    finalizeGraphicsInitialization() {
        const status = this.#programStatus;
        const error = status.getProgramErrors();
        if (error) {
            // The shader helper deletes the failed program.
            this.#programStatus = undefined;
            throw new ViewError(
                error.detail ?? error.message,
                this.mark.unitView
            );
        }
        this.#programInfo = createProgramInfoFromProgram(
            this.gl,
            status.program
        );
    }

    /** @param {import("../../../data/collector.js").default} collector */
    updateGraphicsData(collector) {
        this.deleteGraphicsData();
        const gl = this.gl;
        const { readTile, type } = this.mark.getColorCellBinding();
        const palette = type !== "quantitative" && this.#color?.getScale();
        const indexer =
            palette &&
            /** @type {{domainIndexer: (value: string | number | null) => number}} */ (
                palette.props
            ).domainIndexer;
        const size = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        try {
            for (const datum of collector.getData()) {
                if (this.#tiles.has(datum)) continue;
                const { horizontal, vertical, values } = readTile(datum);
                const width = horizontal.count;
                const height = vertical?.count ?? 1;
                if (width > size || height > size) {
                    throw new Error(
                        `Raster tile ${width} × ${height} exceeds WebGL texture size ${size}.`
                    );
                }
                let src;
                if (values instanceof Uint32Array) {
                    src = values;
                } else if (indexer) {
                    src = Uint32Array.from({ length: values.length }, (_, i) =>
                        indexer(values[i])
                    );
                } else {
                    src =
                        values instanceof Float32Array
                            ? values
                            : Float32Array.from(values, readNumericRasterCell);
                }
                const texture = createTexture(gl, {
                    width,
                    height,
                    src,
                    internalFormat:
                        src instanceof Uint32Array ? gl.R32UI : gl.R32F,
                    minMag: gl.NEAREST,
                    wrap: gl.CLAMP_TO_EDGE,
                    auto: false,
                });
                this.#tiles.set(datum, { texture, width, height });
            }
        } catch (error) {
            this.deleteGraphicsData();
            throw new ViewError(error.message, this.mark.unitView);
        }
    }

    deleteGraphicsData() {
        for (const { texture } of this.#tiles.values()) {
            this.gl.deleteTexture(texture);
        }
        this.#tiles.clear();
    }

    dispose() {
        this.deleteGraphicsData();
        if (this.#programStatus)
            this.gl.deleteProgram(this.#programStatus.program);
    }

    isReady() {
        return !!this.#programInfo;
    }

    getDebugState() {
        return { markUniformsAltered: false, rangeCount: this.#tiles.size };
    }

    /** @param {MarkRenderingOptions} options */
    prepareRender(options) {
        const gl = this.gl;
        return [
            () => {
                gl.useProgram(this.#programInfo.program);
                gl.bindVertexArray(null);
                gl.enable(gl.BLEND);
                this.#viewOpacity =
                    options.applyViewOpacity === false
                        ? 1
                        : this.mark.unitView.getEffectiveOpacity();
                if (!this.#color) return;
                const mapping = this.#color.getMappingRef().get();
                const brush = this.#readCellOpacity?.();
                if (brush) {
                    brush[0] = ceilFloat32(brush[0]);
                    brush[1] = ceilFloat32(brush[1]);
                }
                setUniforms(this.#programInfo, {
                    uBrush: brush,
                    uDomain_color: readScaleDomainUniform(mapping),
                    uRangeTexture_color: this.glHelper.rangeTextures.get(
                        mapping.scale
                    ),
                    uDomainTexture_color: this.resources.getCategoricalTexture(
                        this.#color
                    ),
                });
            },
        ];
    }

    /**
     * @param {{width: number, height: number}} canvasSize
     * @param {number} dpr
     * @param {import("../../../view/layout/rectangle.js").default} coords
     * @param {import("../../../types/rendering.js").ClipOptions} [clip]
     * @param {import("../../../types/rendering.js").ClipOptions} [_cullClip]
     * @param {number} [pixelOffset]
     * @param {{width: number, height: number}} [framebufferSize]
     */
    setViewport(
        canvasSize,
        dpr,
        coords,
        clip,
        _cullClip,
        pixelOffset = RASTER_COORDINATE_OFFSET,
        framebufferSize
    ) {
        this.#coords = coords;
        this.#bounds = createVisibleBounds(
            canvasSize.width,
            canvasSize.height,
            clip
        );
        this.#dpr = dpr;
        this.#pixelOffset = pixelOffset;
        const gl = this.gl;
        this.#target[0] = framebufferSize?.width ?? gl.drawingBufferWidth;
        this.#target[1] = framebufferSize?.height ?? gl.drawingBufferHeight;
        gl.viewport(0, 0, this.#target[0], this.#target[1]);
        gl.disable(gl.SCISSOR_TEST);
        setUniforms(this.#programInfo, { uTarget: this.#target });
        return coords.isDefined();
    }

    /** @param {MarkRenderingOptions} options */
    render(options) {
        return () => {
            if (this.mark.unitView.getCollector()?.completed) {
                visitMarkOccurrences(
                    this.mark,
                    options,
                    this.#coords,
                    this.#sampleFacetCoords,
                    this.#drawOccurrence
                );
            }
        };
    }

    /**
     * @param {import("../../../view/layout/rectangle.js").default} coords
     * @param {object[]} data
     */
    #drawOccurrence = (coords, data) => {
        visitRasterTiles(
            this.mark,
            { coords, data, visibleBounds: this.#bounds },
            this.#drawTile
        );
    };

    /**
     * @param {object} datum @param {number} x0 @param {number} y0 @param {number} dx @param {number} dy
     * @param {ReturnType<import("../../immediate/marks/raster.js").getRasterTriangle>} [triangle]
     */
    #drawTile = (datum, x0, y0, dx, dy, triangle) => {
        const opacity = this.#readCellOpacity
            ? undefined
            : this.mark.encoders.opacity;
        const alpha =
            this.#viewOpacity * (opacity ? encodeNumber(opacity, datum) : 1);
        if (!(alpha > 0)) return;

        const { texture, width, height } = this.#tiles.get(datum);
        const { x1, y1, x2, y2 } = triangle?.sourceBounds ?? this.#bounds;
        this.#setAxis(0, x0, dx, width, x1, x2);
        this.#setAxis(1, y0, dy, height, y1, y2);
        const { uRect } = this.#tileUniforms;
        if (uRect[0] >= uRect[2] || uRect[1] >= uRect[3]) return;
        if (triangle) {
            const { uTriangle, uTriangleClip } = this.#tileUniforms;
            const { clip, baseline, direction } = triangle;
            uTriangle[0] = baseline * this.#dpr;
            uTriangle[1] = direction;
            uTriangleClip[0] = clip.x1 * this.#dpr;
            uTriangleClip[1] = clip.y1 * this.#dpr;
            uTriangleClip[2] = clip.x2 * this.#dpr;
            uTriangleClip[3] = clip.y2 * this.#dpr;
        }
        this.#tileUniforms.uCells = texture;
        this.#tileUniforms.uOpacity = Math.min(1, alpha);
        setUniforms(this.#programInfo, this.#tileUniforms);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    };

    /**
     * Clip in double precision and give the fragment shader a nearby grid line.
     * The signed step preserves cell order on reversed axes.
     * @param {0 | 1} axis @param {number} start @param {number} span
     * @param {number} count @param {number} lo @param {number} hi
     */
    #setAxis(axis, start, span, count, lo, hi) {
        const { uRect, uAnchor, uCellsPerPixel } = this.#tileUniforms;
        start += this.#pixelOffset;
        const end = start + span;
        const first = Math.max(lo, Math.min(start, end));
        const last = Math.min(hi, Math.max(start, end));
        const step = span / count;
        const anchor = clamp(
            Math.round(((first + last) * 0.5 - start) / step),
            0,
            count
        );
        uRect[axis] = first * this.#dpr;
        uRect[axis + 2] = last * this.#dpr;
        uAnchor[axis] = (start + anchor * step) * this.#dpr;
        uAnchor[axis + 2] = anchor;
        uCellsPerPixel[axis] = 1 / (step * this.#dpr);
    }
}

const floatBits = new DataView(new ArrayBuffer(4));

/** Round upward so lower <= cell < upper holds for the Float32 texels.
 * @param {number} threshold
 */
function ceilFloat32(threshold) {
    const rounded = Math.fround(threshold);
    if (!(rounded < threshold)) return rounded;
    floatBits.setFloat32(0, rounded);
    floatBits.setUint32(0, floatBits.getUint32(0) + (rounded >= 0 ? 1 : -1));
    return floatBits.getFloat32(0);
}
