import fromEntries from "fromentries";
import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/rect.vertex.glsl";
import FRAGMENT_SHADER from "../gl/rect.fragment.glsl";
import { RectVertexBuilder } from "../gl/dataToVertices";
import createEncoders, { secondaryChannel } from "../encoder/encoder";

import Mark from "./mark";

/** @type {import("../spec/view").EncodingConfigs} */
const defaultEncoding = {
    x: null,
    x2: null,
    y: null,
    y2: null,
    color: { value: "#4c78a8" }, // TODO: Configurable/theme
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

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),
            minWidth: 0.5, // Minimum width/height prevents annoying flickering when zooming
            minHeight: 0.5,
            minOpacity: 0.0,

            tesselationZoomThreshold: 10, // This works with genomes, but likely breaks with other data. TODO: Fix, TODO: log2
            tesselationTiles: 35
        };
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
        const props = this.getProperties();

        if (
            interval.width() <
            this.getContext()
                .genomeSpy.getDomain()
                .width() /
                props.tesselationZoomThreshold
        ) {
            // TODO: Only bufferize the samples that are being animated
            this._sampleBufferInfo = this._createSampleBufferInfo(
                interval,
                interval.width() / props.tesselationTiles
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

        const props = this.getProperties();
        const xDomain = undefined; //this.getXDomain();
        const domainWidth = xDomain ? xDomain.width() : Infinity;

        this._fullSampleBufferInfo = this._createSampleBufferInfo(
            null,
            domainWidth /
                props.tesselationZoomThreshold /
                props.tesselationTiles
        );
        this._sampleBufferInfo = this._fullSampleBufferInfo;
    }

    /**
     * @param {import("./mark").SampleToRender[]} samples
     */
    render(samples) {
        super.render(samples);

        const gl = this.gl;
        const props = this.getProperties();

        twgl.setUniforms(this.programInfo, {
            uMinSize: [props.minWidth, props.minHeight], // in pixels
            uMinOpacity: props.minOpacity
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
}
