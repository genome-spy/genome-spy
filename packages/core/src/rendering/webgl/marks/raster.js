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
import {
    getRasterTriangle,
    visitRasterTiles,
} from "../../immediate/marks/raster.js";
import { RASTER_COORDINATE_OFFSET } from "../../renderingConstants.js";
import { readScaleDomainUniform } from "../gl/glslScaleGenerator.js";
import { createProgram } from "../gl/webGLHelper.js";
import VERTEX_SHADER from "./raster.vertex.glsl";
import { rasterFragmentShader } from "./rasterShader.js";

/** @typedef {import("../../../marks/rasterOpacity.js").ReadCellOpacity} ReadCellOpacity */
/** @typedef {{texture: WebGLTexture, width: number, height: number, opacity?: WebGLTexture, opacityRevision?: number}} TileTexture */
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

    /** @type {ReadCellOpacity | undefined} */
    #cellOpacity;

    #opacityRevision = 0;

    #uploadTextureUnit = 0;

    #target = [0, 0];
    #tileUniforms = {
        uRect: [0, 0, 0, 0],
        uAnchor: [0, 0, 0, 0],
        uCellsPerPixel: [0, 0],
        uCells: /** @type {WebGLTexture | null} */ (null),
        uCellOpacity: /** @type {WebGLTexture | null} */ (null),
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
        const gl = this.gl;
        // Mask uploads during a draw must leave the active scale samplers bound.
        this.#uploadTextureUnit =
            gl.TEXTURE0 +
            gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) -
            1;
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
        for (const { texture, opacity } of this.#tiles.values()) {
            this.gl.deleteTexture(texture);
            if (opacity) this.gl.deleteTexture(opacity);
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
                const viewOpacity =
                    options.applyViewOpacity === false
                        ? 1
                        : this.mark.unitView.getEffectiveOpacity();
                this.#tileUniforms.uOpacity = Math.min(
                    1,
                    viewOpacity * this.mark.getUniformOpacity()
                );
                const cellOpacity = this.mark.getCellOpacityReader()?.();
                if (cellOpacity !== this.#cellOpacity) {
                    this.#cellOpacity = cellOpacity;
                    this.#opacityRevision++;
                }
                if (!this.#color) return;
                const mapping = this.#color.getMappingRef().get();
                setUniforms(this.#programInfo, {
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
        const triangle = getRasterTriangle(this.mark, coords, this.#bounds);
        if (triangle) {
            const { x1, y1, x2, y2 } = triangle.clip;
            const dpr = this.#dpr;
            setUniforms(this.#programInfo, {
                uTriangle: [triangle.baseline * dpr, triangle.direction],
                uTriangleClip: [x1 * dpr, y1 * dpr, x2 * dpr, y2 * dpr],
            });
        }
        visitRasterTiles(
            this.mark,
            { coords, data, visibleBounds: this.#bounds, triangle },
            this.#drawTile
        );
    };

    /**
     * @param {object} datum @param {number} x0 @param {number} y0 @param {number} dx @param {number} dy
     * @param {ReturnType<import("../../immediate/marks/raster.js").getRasterTriangle>} [triangle]
     */
    #drawTile = (datum, x0, y0, dx, dy, triangle) => {
        if (!(this.#tileUniforms.uOpacity > 0)) return;

        const tile = this.#tiles.get(datum);
        const { texture, width, height } = tile;
        const { x1, y1, x2, y2 } = triangle?.sourceBounds ?? this.#bounds;
        this.#setAxis(0, x0, dx, width, x1, x2);
        this.#setAxis(1, y0, dy, height, y1, y2);
        const { uRect } = this.#tileUniforms;
        if (uRect[0] >= uRect[2] || uRect[1] >= uRect[3]) return;
        const gl = this.gl;
        if (
            this.#cellOpacity &&
            tile.opacityRevision !== this.#opacityRevision
        ) {
            gl.activeTexture(this.#uploadTextureUnit);
            tile.opacity ??= createTexture(gl, {
                width,
                height,
                internalFormat: gl.R32F,
                minMag: gl.NEAREST,
                wrap: gl.CLAMP_TO_EDGE,
                auto: false,
            });
            gl.bindTexture(gl.TEXTURE_2D, tile.opacity);
            gl.texSubImage2D(
                gl.TEXTURE_2D,
                0,
                0,
                0,
                width,
                height,
                gl.RED,
                gl.FLOAT,
                this.#cellOpacity(datum)
            );
            tile.opacityRevision = this.#opacityRevision;
        }
        this.#tileUniforms.uCells = texture;
        this.#tileUniforms.uCellOpacity = tile.opacity ?? null;
        setUniforms(this.#programInfo, this.#tileUniforms);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
