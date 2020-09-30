import fromEntries from "fromentries";
import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/rect.vertex.glsl";
import FRAGMENT_SHADER from "../gl/rect.fragment.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices";
import createEncoders, { secondaryChannel } from "../encoder/encoder";

import Mark from "./mark";

const defaultMarkProperties = {
    clip: true,

    xOffset: 0.0,
    yOffset: 0.0,

    minWidth: 0.5, // Minimum width/height prevents annoying flickering when zooming
    minHeight: 0.5,
    minOpacity: 0.0,

    tesselationZoomThreshold: 10, // This works with genomes, but likely breaks with other data. TODO: Fix, TODO: log2
    tesselationTiles: 35
};

/** @type {import("../spec/view").EncodingConfigs} */
const defaultEncoding = {
    x: null,
    x2: null,
    y: null,
    y2: null,
    color: { value: "#1f77b4" },
    opacity: { value: 1.0 },
    squeeze: { value: "none" } // choices: none, top, right, bottom, left
};

export const SQUEEZE = fromEntries(
    ["none", "top", "right", "bottom", "left"].map((squeeze, i) => [squeeze, i])
);

export default class RectMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        /** @type {Record<string, any>} */
        this.properties = {
            ...defaultMarkProperties,
            ...this.properties
        };

        // TODO: Check markProperties.rectMinOpacity
        this.opaque =
            this.getEncoding().opacity.value >= 1.0 &&
            this.properties.minOpacity >= 1.0;
    }

    getRawAttributes() {
        return {
            x: { complexGeometry: true },
            y: { complexGeometry: true }
        };
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    /**
     * @returns {import("../spec/view").EncodingConfigs}
     */
    getEncoding() {
        const encoding = super.getEncoding();

        /** @param {string} channel */
        function fixPositional(channel) {
            const secondary = secondaryChannel(channel);
            if (encoding[channel]) {
                if (!encoding[secondary]) {
                    if (encoding[channel].type == "quantitative") {
                        // Bar plot, anchor the other end to zero
                        encoding[secondary] = {
                            datum: 0
                        };
                    } else {
                        // Must make copies because the definition may be shared with other views/marks
                        encoding[channel] = { ...encoding[channel] };
                        encoding[secondary] = { ...encoding[channel] };
                        // Fill the bands (bar plot / heatmap)
                        encoding[channel].band = 0;
                        encoding[secondary].band = 1;
                        // Vega-Lite interprets the band property differently on rectangular marks, btw.
                    }
                }
            } else if (encoding[secondary]) {
                throw new Error(
                    `Only secondary channel ${secondary} has been specified!`
                );
            } else {
                // Nothing specified, fill the whole viewport
                encoding[channel] = { value: 0 };
                encoding[secondary] = { value: 1 };
            }
        }

        fixPositional("x");
        fixPositional("y");

        return encoding;
    }

    onBeforeSampleAnimation() {
        const interval = this.getContext().genomeSpy.getViewportDomain();

        if (
            interval.width() <
            this.getContext()
                .genomeSpy.getDomain()
                .width() /
                this.properties.tesselationZoomThreshold
        ) {
            // TODO: Only bufferize the samples that are being animated
            this._sampleBufferInfo = this._createSampleBufferInfo(
                interval,
                interval.width() / this.properties.tesselationTiles
            );
        }
    }

    onAfterSampleAnimation() {
        this._sampleBufferInfo = this._fullSampleBufferInfo;
    }

    /**
     *
     * @param {import("../utils/interval").default} [interval]
     * @param {number} [tesselationThreshold]
     */
    _createSampleBufferInfo(interval, tesselationThreshold) {
        // TODO: Disable tesselation on SimpleTrack - no need for it
        const builder = new RectVertexBuilder(this.encoders, {
            tesselationThreshold,
            visibleRange: interval ? interval.toArray() : undefined
        });

        for (const [sample, data] of this.dataBySample.entries()) {
            builder.addBatch(sample, data);
        }
        const vertexData = builder.toArrays();

        return {
            rangeMap: vertexData.rangeMap,
            bufferInfo: twgl.createBufferInfoFromArrays(
                this.gl,
                vertexData.arrays,
                {
                    numElements: vertexData.vertexCount
                }
            )
        };
    }

    async initializeGraphics() {
        await super.initializeGraphics();

        this.createShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        this.deleteGraphicsData();

        const xDomain = undefined; //this.getXDomain();
        const domainWidth = xDomain ? xDomain.width() : Infinity;

        this._fullSampleBufferInfo = this._createSampleBufferInfo(
            null,
            domainWidth /
                this.properties.tesselationZoomThreshold /
                this.properties.tesselationTiles
        );
        this._sampleBufferInfo = this._fullSampleBufferInfo;
    }

    /**
     * @param {object[]} samples
     */
    render(samples) {
        super.render(samples);

        const gl = this.gl;

        if (this.opaque) {
            gl.disable(gl.BLEND);
        } else {
            gl.enable(gl.BLEND);
        }

        twgl.setUniforms(this.programInfo, {
            uMinSize: [this.properties.minWidth, this.properties.minHeight], // in pixels
            uMinOpacity: this.properties.minOpacity,
            uXOffset: this.properties.xOffset,
            uYOffset: this.properties.yOffset
        });

        twgl.setBuffersAndAttributes(
            gl,
            this.programInfo,
            this._sampleBufferInfo.bufferInfo
        );

        for (const sampleData of samples) {
            const range = this._sampleBufferInfo.rangeMap.get(
                sampleData.sampleId
            );
            if (range) {
                twgl.setUniforms(this.programInfo, sampleData.uniforms);
                // TODO: draw only the part that intersects with the viewport
                // Could use: http://lin-ear-th-inking.blogspot.com/2007/06/packed-1-dimensional-r-tree.html
                twgl.drawBufferInfo(
                    gl,
                    this._sampleBufferInfo,
                    gl.TRIANGLE_STRIP,
                    range.count,
                    range.offset
                );
            }
        }
    }

    /**
     * @param {string} sampleId
     * @param {number} x position on the viewport
     * @param {number} y position on the viewport
     * @param {import("../utils/interval").default} yBand the matched band on the band scale
     */
    findDatum(sampleId, x, y, yBand) {
        const data = this.dataBySample.get(sampleId || "default");

        const gl = this.gl;
        const dpr = window.devicePixelRatio;

        x -= this.properties.xOffset;
        y += this.properties.yOffset;

        if (data) {
            const e = /** @type {Object.<string, import("../encoder/encoder").NumberEncoder>} */ (this
                .encoders);

            const unitMinWidth =
                (this.properties.minWidth / gl.drawingBufferWidth) * dpr;
            const halfMinWidth =
                (unitMinWidth *
                    this.getContext()
                        .genomeSpy.getViewportDomain()
                        .width()) /
                2;

            const unitMinHeight =
                (this.properties.minHeight / gl.drawingBufferHeight) * dpr;
            const halfMinHeight = unitMinHeight / 2; // TODO: take yBand into account

            const scaledX = this.getContext().genomeSpy.rescaledX.invert(x);

            const scaledY = 1 - (y - yBand.lower) / yBand.width();

            const matchX = this.properties.minWidth
                ? d => {
                      const halfWidth = Math.max(
                          (e.x2(d) - e.x(d)) / 2,
                          halfMinWidth
                      );
                      const centre = (e.x(d) + e.x2(d)) / 2;

                      return (
                          scaledX >= centre - halfWidth &&
                          scaledX < centre + halfWidth
                      );
                  }
                : d => {
                      return (
                          (scaledX >= e.x(d) && scaledX < e.x2(d)) ||
                          (scaledX >= e.x2(d) && scaledX < e.x(x))
                      );
                  };

            const matchY = this.properties.minHeight
                ? d => {
                      const halfHeight = Math.max(
                          Math.abs(e.y2(d) - e.y(d)) / 2,
                          halfMinHeight
                      );
                      const centre = (e.y(d) + e.y2(d)) / 2;

                      return (
                          scaledY >= centre - halfHeight &&
                          scaledY < centre + halfHeight
                      );
                  }
                : d => {
                      return (
                          (scaledY >= e.y(d) && scaledY < e.y2(d)) ||
                          (scaledY >= e.y2(d) && scaledY < e.y(d))
                      );
                  };

            // The current search "algorithm" is the grand old linear search. However, it does not scale to
            // very large data sets.
            // TODO: Use indexing based on interval trees or R-trees
            let lastMatch = null;
            for (let datum of data) {
                if (matchX(datum) && matchY(datum)) {
                    lastMatch = datum;
                }
            }

            return lastMatch;
        }
    }

    /**
     * Finds a datum that overlaps the given value on domain.
     * The result is unspecified if multiple datums are found.
     *
     * TODO: Rename the other findDatum to findSpec
     *
     * @param {string} sampleId
     * @param {number} x position on the x domain
     * @returns {object}
     */
    findDatumAt(sampleId, x) {
        const e = this.encoders;
        const data = this.dataBySample.get(sampleId);
        if (data) {
            return data.find(d => x >= e.x(d) && x < e.x2(d));
        }
    }

    getRangeAggregates() {
        // Aggregates can be used for sorting and filtering

        // TODO: Implement
        // Stuff that computes aggregates for a field of a (ordered) set of datums
        // Quantitative: Max, min, (weighted) mean, count, (total) difference between adjacent columns
        // Categorical: The most common category, other?
        return {
            quantitative: null,
            categorical: null
        };
    }
}
