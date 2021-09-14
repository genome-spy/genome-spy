import { drawBufferInfo, setBuffersAndAttributes, setUniforms } from "twgl.js";
import { bisector, quantileSorted } from "d3-array";
import { zoomLinear } from "vega-util";
import { PointVertexBuilder } from "../gl/dataToVertices";
import VERTEX_SHADER from "../gl/point.vertex.glsl";
import FRAGMENT_SHADER from "../gl/point.fragment.glsl";

import Mark from "./mark";
import { sampleIterable } from "../data/transforms/sample";
import { fixFill, fixStroke } from "./markUtils";

/** @type {Record<string, import("../view/viewUtils").ChannelDef>} */
const defaultEncoding = {};

export default class PointMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        Object.defineProperties(
            this.defaultProperties,
            Object.getOwnPropertyDescriptors({
                x: 0.5,
                y: 0.5,
                color: "#4c78a8",
                filled: true,
                opacity: 1.0,
                size: 100.0,
                semanticScore: 0.0, // TODO: Should be datum instead of value. But needs fixing.
                shape: "circle",
                strokeWidth: 2.0,
                fillGradientStrength: 0.0,
                dx: 0,
                dy: 0,
                angle: 0,

                maxRelativePointDiameter: 0.8,
                minAbsolutePointDiameter: 0,

                semanticZoomFraction: 0.02,
            })
        );
    }

    getAttributes() {
        return [
            "inwardStroke",
            "uniqueId",
            "facetIndex",
            "x",
            "y",
            "size",
            "semanticScore",
            "shape",
            "strokeWidth",
            "gradientStrength",
            "dx",
            "dy",
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "angle",
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
            "dy",
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "angle",
        ];
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    /**
     * @param {import("../spec/channel").Encoding} encoding
     * @returns {import("../spec/channel").Encoding}
     */
    fixEncoding(encoding) {
        fixStroke(encoding, this.properties.filled);
        fixFill(encoding, this.properties.filled);

        // TODO: Function for getting rid of extras. Also should validate that all attributes are defined
        delete encoding.color;
        delete encoding.opacity;

        return encoding;
    }

    initializeData() {
        super.initializeData();

        // Semantic zooming is currently solely a feature of point mark.
        // Build a sorted sample that allows for computing p-quantiles
        const semanticScoreAccessor =
            this.unitView.getAccessor("semanticScore");
        if (semanticScoreAccessor) {
            // n chosen using Stetson-Harrison
            // TODO: Throw on missing scores
            this.sampledSemanticScores = Float32Array.from(
                sampleIterable(
                    10000,
                    this.unitView.getCollector().getData(),
                    semanticScoreAccessor
                )
            );
            this.sampledSemanticScores.sort((a, b) => a - b);
        }
    }

    async initializeGraphics() {
        await super.initializeGraphics();
        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;
        setUniforms(this.programInfo, {
            uInwardStroke: props.inwardStroke,
            uGradientStrength: props.fillGradientStrength,
            uMaxRelativePointDiameter: props.maxRelativePointDiameter,
            uMinAbsolutePointDiameter: props.minAbsolutePointDiameter,
        });
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        const itemCount = collector.getItemCount();

        const builder = new PointVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems: Math.max(itemCount, this.properties.minBufferSize || 0),
        });

        builder.addBatches(collector.facetBatches);

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

    /**
     * @param {import("../view/rendering").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        super.prepareRender(options);

        setUniforms(this.programInfo, {
            uMaxPointSize: this._getMaxPointSize(),
            uScaleFactor: this._getGeometricScaleFactor(),
            uSemanticThreshold: this.getSemanticThreshold(),
        });

        setBuffersAndAttributes(
            this.gl,
            this.programInfo,
            this.vertexArrayInfo
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

            /** @param {any[]} facetId */
            this._findIndices = (facetId) => {
                const data = this.unitView
                    .getCollector()
                    .facetBatches.get(facetId);

                return [
                    bisect(data, paddedDomain[0]),
                    bisect(data, paddedDomain[paddedDomain.length - 1]),
                ];
            };
        }
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback(
            (offset, count) => {
                // TODO: findIndices is rather slow. Consider a more coarse-grained, "tiled" solution.
                const [lower, upper] = this._findIndices
                    ? this._findIndices(options.facetId)
                    : [0, count];

                const length = upper - lower;

                if (length) {
                    drawBufferInfo(
                        gl,
                        this.vertexArrayInfo,
                        gl.POINTS,
                        length,
                        offset + lower
                    );
                }
            },
            options,
            () => this.rangeMap
        );
    }
}
