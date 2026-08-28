import { isString } from "vega-util";
import { format } from "d3-format";
import {
    drawBufferInfo,
    setBlockUniforms,
    setBuffersAndAttributes,
    setUniforms,
} from "twgl.js";
import VERTEX_SHADER from "./text.vertex.glsl";
import FRAGMENT_SHADER from "./text.fragment.glsl";
import COMMON_SHADER from "./text.common.glsl";
import { TextVertexBuilder } from "../gl/dataToVertices.js";

import WebGLMark from "./webGlMark.js";
import { isExprRef } from "../../../paramRuntime/paramUtils.js";

/** For GLSL uniforms */
const alignments = {
    left: -1,
    center: 0,
    right: 1,
};

/** For GLSL uniforms */
const baselines = {
    top: -1,
    middle: 0,
    bottom: 1,
    alphabetic: 1,
    baseline: 1,
};

/**
 * Renders text using SDF fonts
 *
 * Some resources:
 * - Valve's SDF paper: https://doi.org/10.1145/1281500.1281665
 * - Multi-channel SDF fonts: https://github.com/Chlumsky/msdfgen
 * - Google's web fonts as SDFs: https://github.com/etiennepinchon/aframe-fonts
 *
 * @extends {WebGLMark}
 */
export default class WebGLTextMark extends WebGLMark {
    /**
     * @returns {import("../../../spec/channel.js").Channel[]}
     */
    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "x2",
            "y",
            "y2",
            "xOffset",
            "yOffset",
            /** @type {import("../../../spec/channel.js").Channel} */ (
                "x2Offset"
            ),
            /** @type {import("../../../spec/channel.js").Channel} */ (
                "y2Offset"
            ),
            "color",
            "size",
            "opacity",
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

        const props = /** @type {import("../../../spec/mark.js").TextProps} */ (
            this.properties
        );

        // 0.35 is a magic number found by trial and error
        const sdfNumerator =
            this.font.metrics.common.base *
            0.35 *
            (this.properties.logoLetters ? 0.5 : 1);

        this.registerMarkUniformValue("uPaddingX", props.paddingX);
        this.registerMarkUniformValue("uPaddingY", props.paddingY);
        this.registerMarkUniformValue("uFlushX", props.flushX, (x) => !!x);
        this.registerMarkUniformValue("uFlushY", props.flushY, (x) => !!x);
        this.registerMarkUniformValue("uSqueeze", props.squeeze, (x) => !!x);

        this.registerMarkUniformVector("uViewportEdgeFadeWidth", [
            props.viewportEdgeFadeWidthTop,
            props.viewportEdgeFadeWidthRight,
            props.viewportEdgeFadeWidthBottom,
            props.viewportEdgeFadeWidthLeft,
        ]);
        this.registerMarkUniformVector("uViewportEdgeFadeDistance", [
            props.viewportEdgeFadeDistanceTop,
            props.viewportEdgeFadeDistanceRight,
            props.viewportEdgeFadeDistanceBottom,
            props.viewportEdgeFadeDistanceLeft,
        ]);

        setBlockUniforms(this.markUniformInfo, {
            uAlign: [alignments[props.align], baselines[props.baseline]],

            uD: [props.dx, -props.dy],

            uLogoLetter: !!props.logoLetters,

            uSdfNumerator: sdfNumerator,
        });
    }

    /**
     * Registers a vector uniform whose components may be expression references.
     *
     * @param {string} uniformName
     * @param {(number | import("../../../spec/parameter.js").ExprRef)[]} values
     */
    registerMarkUniformVector(uniformName, values) {
        const setter = this.createMarkUniformSetter(uniformName);
        /** @type {(() => number)[]} */
        const readers = [];
        const update = () => setter(readers.map((read) => read()));

        for (const value of values) {
            readers.push(
                isExprRef(value)
                    ? this.unitView.paramRuntime.watchExpression(
                          value.expr,
                          update
                      )
                    : () => value
            );
        }

        update();
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        if (!collector) {
            console.debug("No collector");
            return;
        }
        const data = collector.getData();
        const encoding = this.encoding;

        // Count the total number of characters to that we can pre-allocate a typed array
        const accessor = this.encoders.text; // accessor or constant value
        let charCount = 0;
        /** @type {function(any):any} */
        const numberFormat =
            "format" in encoding.text ? format(encoding.text.format) : (d) => d;
        for (const d of data) {
            // TODO: Optimization: don't format twice (calculation and actual encoding)
            const value = numberFormat(accessor(d));
            const str = isString(value)
                ? value
                : value === null
                  ? ""
                  : "" + value;
            charCount += (str && str.length) || 0;
        }

        const builder = new TextVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            properties: this.properties,
            fontMetrics: this.font.metrics,
            numCharacters: Math.max(
                charCount,
                // There's some mysterious bug with growing the buffer –
                // old buffer is rendered instead of the new one.
                // TODO: Figure it out
                this.properties.minBufferSize || 1024
            ),
        });

        builder.addBatches(collector.facetBatches);

        const vertexData = builder.toArrays();
        this.rangeMap.migrateEntries(vertexData.rangeMap);

        this.updateBufferInfo(vertexData);
    }

    /**
     * @param {import("../../../types/rendering.js").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        const ops = super.prepareRender(options);

        ops.push(() => {
            setUniforms(this.programInfo, {
                uTexture: this.rendererResources.getFontTexture(
                    this.font.bitmapUrl
                ),
            });
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

        return this.createRenderCallback(
            (offset, count) =>
                drawBufferInfo(
                    gl,
                    this.vertexArrayInfo,
                    gl.TRIANGLES,
                    count,
                    offset
                ),
            options
        );
    }
}
