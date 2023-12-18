import { drawBufferInfo, setBuffersAndAttributes, setUniforms } from "twgl.js";
import { quantileSorted } from "d3-array";
import { PointVertexBuilder } from "../gl/dataToVertices.js";
import VERTEX_SHADER from "../gl/point.vertex.glsl";
import FRAGMENT_SHADER from "../gl/point.fragment.glsl";
import COMMON_SHADER from "../gl/point.common.glsl";

import Mark from "./mark.js";
import { sampleIterable } from "../data/transforms/sample.js";
import { fixFill, fixStroke } from "./markUtils.js";

/** @type {Record<string, import("../spec/channel.js").ChannelDef>} */
const defaultEncoding = {};

export default class PointMark extends Mark {
    /**
     * @param {import("../view/unitView.js").default} unitView
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

                sampleFacetPadding: 0.1,

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

    /**
     * @returns {import("../spec/channel.js").Channel[]}
     */
    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "size",
            "semanticScore",
            "shape",
            "strokeWidth",
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
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
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
        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER, [
            COMMON_SHADER,
        ]);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;
        setUniforms(this.programInfo, {
            uInwardStroke: props.inwardStroke,
            uGradientStrength: props.fillGradientStrength,
            uMaxRelativePointDiameter: 1 - 2 * props.sampleFacetPadding,
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
        this.rangeMap.migrateEntries(vertexData.rangeMap);
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
            return /** @type {number[]} */ (e.scale.range()).reduce((a, b) =>
                Math.max(a, b)
            );
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
                const scores = /** @type {any} */ (this.sampledSemanticScores);
                return quantileSorted(/** @type {number[]} */ (scores), p);
            }
        } else {
            return -1;
        }
    }

    /**
     * @param {import("../types/rendering.js").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        const ops = super.prepareRender(options);

        ops.push(() =>
            setUniforms(this.programInfo, {
                uMaxPointSize: this._getMaxPointSize(),
                uScaleFactor: this._getGeometricScaleFactor(),
                uSemanticThreshold: this.getSemanticThreshold(),
            })
        );

        ops.push(() =>
            setBuffersAndAttributes(
                this.gl,
                this.programInfo,
                this.vertexArrayInfo
            )
        );

        return ops;
    }

    /**
     * @param {import("./mark.js").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback((offset, count) => {
            if (count) {
                drawBufferInfo(
                    gl,
                    this.vertexArrayInfo,
                    gl.POINTS,
                    count,
                    offset
                );
            }
        }, options);
    }
}
