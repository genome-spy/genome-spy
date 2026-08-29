import {
    drawBufferInfo,
    setBlockUniforms,
    setBuffersAndAttributes,
} from "twgl.js";
import { PointVertexBuilder } from "../gl/dataToVertices.js";
import VERTEX_SHADER from "./point.vertex.glsl";
import FRAGMENT_SHADER from "./point.fragment.glsl";
import COMMON_SHADER from "./point.common.glsl";

import WebGLMark from "./webGlMark.js";

/**
 * @extends {WebGLMark}
 */
export default class WebGLPointMark extends WebGLMark {
    /**
     * @returns {import("../../../spec/channel.js").Channel[]}
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

    initializeGraphics() {
        super.initializeGraphics();
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

    /** @param {import("../../../data/collector.js").default} collector */
    updateGraphicsData(collector) {
        const itemCount = collector.getItemCount();

        const builder = new PointVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems: itemCount,
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

    /**
     * @param {import("../../../types/rendering.js").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        const ops = super.prepareRender(options);

        ops.push(() => {
            // TODO: Use bindUniformBlock if none of the uniform has changed
            setBlockUniforms(this.markUniformInfo, {
                uScaleFactor: this.#getGeometricScaleFactor(),
                uSemanticThreshold: /** @type {any} */ (
                    this.mark
                ).getSemanticThreshold(),
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
     * @param {import("../types.js").WebGLMarkRenderingOptions} options
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
