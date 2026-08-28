import WebGLMark from "./webGlMark.js";
import {
    createTexture,
    drawBufferInfo,
    setBlockUniforms,
    setBuffersAndAttributes,
    setUniforms,
} from "twgl.js";
import VERTEX_SHADER from "./rule.vertex.glsl";
import FRAGMENT_SHADER from "./rule.fragment.glsl";
import COMMON_SHADER from "./rule.common.glsl";
import { RuleVertexBuilder } from "../gl/dataToVertices.js";

/**
 * @extends {WebGLMark}
 */
export default class WebGLRuleMark extends WebGLMark {
    /**
     * @param {import("../../../marks/mark.js").default} mark
     * @param {import("../gl/webGLHelper.js").default} glHelper
     * @param {import("../rendererResources.js").default} rendererResources
     */
    constructor(mark, glHelper, rendererResources) {
        super(mark, glHelper, rendererResources);

        /** @type {WebGLTexture | undefined} */
        this.dashTexture = undefined;
        this.dashTextureSize = 0;
    }

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
            "size",
            "color",
            "opacity",
        ];
    }

    initializeGraphics() {
        super.initializeGraphics();

        const gl = this.gl;
        const textureData = createDashTextureArray(this.properties.strokeDash);
        this.dashTexture = createTexture(gl, {
            level: 0,
            mag: gl.NEAREST,
            min: gl.NEAREST,
            internalFormat: gl.R8,
            format: gl.RED,
            src: textureData,
            height: 1,
        });
        this.dashTextureSize = textureData.length; // Not needed with WebGL2

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER, [
            COMMON_SHADER,
        ]);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        this.registerMarkUniformValue("uMinLength", props.minLength);
        this.registerMarkUniformValue(
            "uStrokeCap",
            props.strokeCap ?? "butt",
            (cap) => ["butt", "square", "round"].indexOf(cap)
        );

        setBlockUniforms(this.markUniformInfo, {
            uDashTextureSize: +this.dashTextureSize,
        });
        this.markUniformsAltered = true;
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        if (!collector) {
            console.debug("No collector");
            return;
        }
        const itemCount = collector.getItemCount();

        const builder = new RuleVertexBuilder({
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
     * @param {import("../../../types/rendering.js").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        const ops = super.prepareRender(options);

        ops.push(() => this.bindOrSetMarkUniformBlock());

        ops.push(() =>
            // Dash texture must be set always. Otherwise the texture unit may have
            // an incompatible texture from an earlier program.
            setUniforms(this.programInfo, {
                uDashTexture: this.dashTexture,
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
     * @param {import("../types.js").WebGLMarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback(
            (offset, count) =>
                drawBufferInfo(
                    gl,
                    this.vertexArrayInfo,
                    gl.TRIANGLE_STRIP,
                    count,
                    offset
                ),
            options
        );
    }

    dispose() {
        if (this.dashTexture) {
            this.gl.deleteTexture(this.dashTexture);
            this.dashTexture = undefined;
        }
        super.dispose();
    }
}

/**
 *
 * @param {number[]} pattern
 */
function createDashTextureArray(pattern) {
    if (!pattern) {
        return new Uint8Array(0);
    }

    if (
        pattern.length == 0 ||
        pattern.length % 2 ||
        pattern.findIndex((s) => Math.round(s) != s || s < 1 || s > 1000) >= 0
    ) {
        throw new Error(
            "Invalid stroke dash pattern: " + JSON.stringify(pattern)
        );
    }

    const len = pattern.reduce((a, b) => a + b);

    const texture = new Uint8Array(len);

    let state = true;
    let i = 0;
    for (let segment of pattern) {
        while (segment) {
            texture[i++] = (state && 255) || 0;
            segment--;
        }
        state = !state;
    }

    return texture;
}
