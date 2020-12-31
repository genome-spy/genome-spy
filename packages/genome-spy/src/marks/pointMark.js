import * as twgl from "twgl.js";
import { bisector, quantileSorted } from "d3-array";
import { zoomLinear } from "vega-util";
import { PointVertexBuilder } from "../gl/dataToVertices";
import VERTEX_SHADER from "../gl/point.vertex.glsl";
import FRAGMENT_SHADER from "../gl/point.fragment.glsl";

import Mark from "./mark";
import SampleTransform from "../data/transforms/sample";

/** @type {Record<string, import("../view/viewUtils").ChannelDef>} */
const defaultEncoding = {};

export const SHAPES = Object.fromEntries(
    [
        "circle",
        "square",
        "triangle-up",
        "cross",
        "diamond",
        "triangle-down",
        "triangle-right",
        "triangle-left"
    ].map((shape, i) => [shape, i])
);

export default class PointMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);
    }

    getAttributes() {
        return [
            "x",
            "y",
            "size",
            "color",
            "opacity",
            "semanticScore",
            "shape",
            "strokeWidth",
            "gradientStrength",
            "dx",
            "dy"
        ];
    }

    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "size",
            "semanticScore",
            "shape",
            "strokeWidth",
            "gradientStrength",
            "dx",
            "dy"
        ];
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),

            x: 0.5,
            y: 0.5,
            color: "#4c78a8",
            opacity: 1.0,
            size: 100.0,
            semanticScore: 0.0, // TODO: Should be datum instead of value. But needs fixing.
            shape: "circle",
            strokeWidth: 0.0,
            gradientStrength: 0.0,
            dx: 0,
            dy: 0,

            /** TODO: Implement */
            relativeSizing: false,

            maxRelativePointDiameter: 0.8,
            minAbsolutePointDiameter: 0,

            semanticZoomFraction: 0.02
        };
    }

    initializeData() {
        super.initializeData();

        const xAccessor = this.unitView.getAccessor("x");
        if (xAccessor) {
            // Sort each point of each sample for binary search
            // TODO: Support pre-sorted data
            for (const arr of this.dataByFacet.values()) {
                arr.sort((a, b) => xAccessor(a) - xAccessor(b));
            }
        }

        // Semantic zooming is currently solely a feature of point mark.
        // Build a sorted sample that allows for computing p-quantiles
        const semanticScoreAccessor = this.unitView.getAccessor(
            "semanticScore"
        );
        if (semanticScoreAccessor) {
            const sampler = new SampleTransform({ type: "sample", size: 3000 }); // n chosen using Stetson-Harrison
            for (const d of this.unitView.getCollectedData()) {
                // TODO: Throw on missing scores
                sampler.handle(semanticScoreAccessor(d));
            }
            sampler.complete();

            this.sampledSemanticScores = Float32Array.from(sampler.reservoir);
            this.sampledSemanticScores.sort((a, b) => a - b);
        }
    }

    async initializeGraphics() {
        await super.initializeGraphics();
        this.createShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        const itemCount = [...this.dataByFacet.values()]
            .map(arr => arr.length)
            .reduce((a, c) => a + c, 0);

        const builder = new PointVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems: Math.min(itemCount, this.properties.minBufferSize || 0)
        });

        for (const [sample, points] of this.dataByFacet.entries()) {
            builder.addBatch(sample, points);
        }
        const vertexData = builder.toArrays();
        this.rangeMap = vertexData.rangeMap;
        this.updateBufferInfo(vertexData);
    }

    _getGeometricScaleFactor() {
        const zoomLevel = Math.pow(2, this.properties.geometricZoomBound || 0);

        return Math.pow(
            Math.min(1, this.unitView.getZoomLevel() / zoomLevel),
            1 / 3
            // note: 1/3 appears to yield perceptually more uniform result than 1/2. I don't know why!
        );
    }

    /**
     * Returns the maximum size of the points in the data, before any scaling
     */
    _getMaxPointSize() {
        const e = this.encoders.size;
        if (e.constant) {
            return e(null);
        } else {
            return e.scale.range().reduce((a, b) => Math.max(a, b));
        }
    }

    getSemanticThreshold() {
        if (this.sampledSemanticScores) {
            const p = Math.max(
                0,
                1 -
                    this.properties.semanticZoomFraction *
                        this.unitView.getZoomLevel()
            );
            if (p <= 0) {
                // The sampled scores may be missing the min/max values
                return -Infinity;
            } else if (p >= 1) {
                return Infinity;
            } else {
                return quantileSorted(this.sampledSemanticScores, p);
            }
        } else {
            return -1;
        }
    }

    prepareRender() {
        super.prepareRender();

        twgl.setUniforms(this.programInfo, {
            uMaxRelativePointDiameter: this.properties.maxRelativePointDiameter,
            uMinAbsolutePointDiameter: this.properties.minAbsolutePointDiameter,
            uMaxPointSize: this._getMaxPointSize(),
            uScaleFactor: this._getGeometricScaleFactor(),
            uSemanticThreshold: this.getSemanticThreshold()
        });

        twgl.setBuffersAndAttributes(
            this.gl,
            this.programInfo,
            this.bufferInfo
        );

        // Setup bisector that allows for searching the points that reside within the viewport.
        const xEncoder = this.encoders.x;
        if (xEncoder && !xEncoder.constant) {
            const bisect = bisector(xEncoder.accessor).left;
            const visibleDomain = this.unitView
                .getScaleResolution("x")
                .getScale()
                .domain();

            // A hack to include points that are just beyond the borders. TODO: Compute based on maxPointSize
            const paddedDomain = zoomLinear(visibleDomain, null, 1.01);

            /** @param {any[]} data */
            this._findIndices = data => [
                bisect(data, paddedDomain[0]),
                bisect(data, paddedDomain[paddedDomain.length - 1])
            ];
        }
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback(
            range => {
                // TODO: findIndices is rather slow. Consider a more coarse-grained, "tiled" solution.
                const [lower, upper] = this._findIndices
                    ? this._findIndices(this.dataByFacet.get(options.facetId))
                    : [0, range.count];

                const length = upper - lower;

                if (length) {
                    twgl.drawBufferInfo(
                        gl,
                        this.vertexArrayInfo,
                        gl.POINTS,
                        length,
                        range.offset + lower
                    );
                }
            },
            options,
            () => this.rangeMap
        );
    }
}
