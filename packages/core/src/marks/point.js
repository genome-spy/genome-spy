import {
    drawBufferInfo,
    setBlockUniforms,
    setBuffersAndAttributes,
} from "twgl.js";
import { quantileSorted } from "d3-array";
import { PointVertexBuilder } from "../gl/dataToVertices.js";
import VERTEX_SHADER from "./point.vertex.glsl";
import FRAGMENT_SHADER from "./point.fragment.glsl";
import COMMON_SHADER from "./point.common.glsl";

import Mark from "./mark.js";
import { getEncoderDataAccessor, isValueDef } from "../encoder/encoder.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";
import { sampleIterable } from "../data/transforms/sample.js";
import { fixFill, fixStroke } from "./markUtils.js";
import { createSvgElement } from "../view/renderingContext/svgViewRenderingContext.js";
import {
    encodeNumber,
    encodePosition,
    encodeString,
    projectX,
    projectY,
} from "./svgMarkUtils.js";

/** @type {Record<string, import("../spec/channel.js").ChannelDef>} */
const defaultEncoding = {};

/**
 * @extends {Mark<import("../spec/mark.js").PointProps>}
 */
export default class PointMark extends Mark {
    #semanticZoomFraction = () => 0;

    /**
     * @param {import("../view/unitView.js").default} unitView
     */
    constructor(unitView) {
        super(unitView);
        // TODO: This mess should be simplified
        // TODO: createExpression should accept constant values or ExprRefs and allow
        // easy registration of requestRender listeners
        const szf = this.properties.semanticZoomFraction;
        if (szf != null) {
            if (isExprRef(szf)) {
                const fn = this.unitView.paramRuntime.watchExpression(
                    szf.expr,
                    () => this.getContext().animator.requestRender()
                );
                this.#semanticZoomFraction = fn;
            } else {
                this.#semanticZoomFraction = () => szf;
            }
        }

        if ("geometricZoomBound" in this.properties) {
            console.warn(
                'geometricZoomBound is deprecated. Use something like the following instead: "size": { "expr": "min(0.5 * pow(zoomLevel, 2), 200)" }.'
            );
        }
    }

    /**
     * @returns {import("../spec/channel.js").Channel[]}
     */
    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "y",
            "xOffset",
            "yOffset",
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
        const configured = this.unitView.getEncoding();
        const mark =
            typeof this.unitView.spec.mark == "object"
                ? this.unitView.spec.mark
                : {};
        const lineShape =
            isValueDef(encoding.shape) &&
            (encoding.shape.value === "x" || encoding.shape.value === "+");
        const configuredStrokeWidth = encoding.strokeWidth;

        for (const [legacy, offset] of /** @type {const} */ ([
            ["dx", "xOffset"],
            ["dy", "yOffset"],
        ])) {
            const legacyExplicit = configured[legacy] != null || legacy in mark;
            const offsetExplicit = configured[offset] != null || offset in mark;

            if (legacyExplicit && offsetExplicit) {
                throw new Error(
                    `Point marks cannot combine legacy ${legacy} with ${offset}. Use only ${offset}.`
                );
            }
        }

        fixStroke(encoding, this.properties.filled);
        fixFill(encoding, this.properties.filled);

        // A stroke-less point normally uses zero stroke width because its fill
        // is the visible geometry. Line-only shapes are line geometry, so
        // retain their configured width when they fall back to fill color.
        if (
            lineShape &&
            isValueDef(encoding.stroke) &&
            encoding.stroke.value === null
        ) {
            encoding.strokeOpacity = { value: 0 };
            if (configuredStrokeWidth) {
                encoding.strokeWidth = configuredStrokeWidth;
            }
        }

        // TODO: Function for getting rid of extras. Also should validate that all attributes are defined
        delete encoding.color;
        delete encoding.opacity;

        return encoding;
    }

    initializeData() {
        super.initializeData();

        // Semantic zooming is currently solely a feature of point mark.
        // Build a sorted sample that allows for computing p-quantiles
        const semanticScoreAccessor = this.encoders["semanticScore"]
            ? getEncoderDataAccessor(
                  this.encoders["semanticScore"]
              )?.asNumberAccessor()
            : undefined;
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

        this.registerMarkUniformValue(
            "uInwardStroke",
            props.inwardStroke,
            (x) => !!x
        );
        this.registerMarkUniformValue(
            "uGradientStrength",
            props.fillGradientStrength
        );
        this.registerMarkUniformValue("uMinPickingSize", props.minPickingSize);
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        if (!collector) {
            console.debug("No collector");
            return;
        }
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

    /**
     * This and `geometricZoomBound` should be deprecated once params (zoomLevel) and
     * expressions are documented.
     */
    #getGeometricScaleFactor() {
        const zoomLevel = Math.pow(2, this.properties.geometricZoomBound || 0);

        return Math.pow(
            Math.min(1, this.unitView.getZoomLevel() / zoomLevel),
            1 / 3
            // note: 1/3 appears to yield perceptually more uniform result than 1/2. I don't know why!
        );
    }

    getSemanticThreshold() {
        if (this.sampledSemanticScores) {
            if (this.sampledSemanticScores.length === 0) {
                return -1;
            }

            const p = Math.max(
                0,
                1 - this.#semanticZoomFraction() * this.unitView.getZoomLevel()
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

        ops.push(() => {
            // TODO: Use bindUniformBlock if none of the uniform has changed
            setBlockUniforms(this.markUniformInfo, {
                uScaleFactor: this.#getGeometricScaleFactor(),
                uSemanticThreshold: this.getSemanticThreshold(),
            });
            this.markUniformsAltered = true;
        });

        ops.push(() => this.bindOrSetMarkUniformBlock());

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

    /**
     * @param {import("../view/renderingContext/svgViewRenderingContext.js").default} context
     * @param {import("../view/renderingContext/svgViewRenderingContext.js").SvgMarkRenderingOptions} options
     */
    renderSvg(context, options) {
        if (
            this.properties.inwardStroke ||
            this.properties.fillGradientStrength ||
            this.properties.geometricZoomBound
        ) {
            throw new Error(
                "SVG export does not support point gradients or zoom-dependent geometry yet."
            );
        }

        const { coords, data, group, viewOpacity } = options;
        const encoders =
            /** @type {Record<string, import("../types/encoder.js").Encoder>} */ (
                this.encoders
            );
        const semanticThreshold = this.getSemanticThreshold();

        for (const datum of data) {
            const shape = encodeString(encoders.shape, datum);
            if (shape != "circle") {
                throw new Error(
                    `SVG export only supports circle points in the proof of concept. Received: ${shape}`
                );
            }
            if (
                encodeNumber(encoders.semanticScore, datum) < semanticThreshold
            ) {
                continue;
            }

            const circle = createSvgElement("circle", {
                cx: projectX(
                    coords,
                    encodePosition(encoders.x, datum),
                    encodeNumber(encoders.xOffset, datum) +
                        encodeNumber(encoders.dx, datum)
                ),
                cy: projectY(
                    coords,
                    encodePosition(encoders.y, datum),
                    encodeNumber(encoders.yOffset, datum) -
                        encodeNumber(encoders.dy, datum)
                ),
                r: Math.sqrt(encodeNumber(encoders.size, datum)) / 2,
                fill: encodeString(encoders.fill, datum),
                "fill-opacity":
                    encodeNumber(encoders.fillOpacity, datum) * viewOpacity,
                stroke: encodeString(encoders.stroke, datum),
                "stroke-opacity":
                    encodeNumber(encoders.strokeOpacity, datum) * viewOpacity,
                "stroke-width": encodeNumber(encoders.strokeWidth, datum),
            });
            group.appendChild(circle);
        }
    }
}
