import Mark from "./mark.js";
import {
    bindUniformBlock,
    createTexture,
    drawBufferInfo,
    setBlockUniforms,
    setBuffersAndAttributes,
    setUniformBlock,
    setUniforms,
} from "twgl.js";
import VERTEX_SHADER from "../gl/rule.vertex.glsl";
import FRAGMENT_SHADER from "../gl/rule.fragment.glsl";
import COMMON_SHADER from "../gl/rule.common.glsl";
import { RuleVertexBuilder } from "../gl/dataToVertices.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";

export default class RuleMark extends Mark {
    /**
     * @param {import("../view/unitView.js").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        this.dashTextureSize = 0;

        Object.defineProperties(
            this.defaultProperties,
            Object.getOwnPropertyDescriptors({
                x2: undefined,
                y2: undefined,
                size: 1,
                color: "black",
                opacity: 1.0,

                minLength: 0.0,
                /** @type {number[]} */
                strokeDash: null,
                strokeDashOffset: 0,
                strokeCap: "butt",
            })
        );
    }

    getAttributes() {
        return [
            "uniqueId",
            "facetIndex",
            "x",
            "x2",
            "y",
            "y2",
            "size",
            "color",
            "opacity",
        ];
    }

    /**
     * @returns {import("../spec/channel.js").Channel[]}
     */
    getSupportedChannels() {
        return [...super.getSupportedChannels(), "x2", "y2", "size"];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    // eslint-disable-next-line complexity
    fixEncoding(encoding) {
        // TODO: Write test for this mess
        if (encoding.x && encoding.y && encoding.x2 && encoding.y2) {
            // Everything is defined
        } else if (encoding.x && encoding.x2 && !encoding.y) {
            encoding.y = { value: 0.5 };
            encoding.y2 = encoding.y;
        } else if (encoding.y && encoding.y2 && !encoding.x) {
            encoding.x = { value: 0.5 };
            encoding.x2 = encoding.x;
        } else if (encoding.x && !encoding.y) {
            // Vertical rule
            encoding.y = { value: 0 };
            encoding.y2 = { value: 1 };
            encoding.x2 = encoding.x;
        } else if (encoding.y && !encoding.x) {
            // Horizontal rule
            encoding.x = { value: 0 };
            encoding.x2 = { value: 1 };
            encoding.y2 = encoding.y;
        } else if (encoding.x && encoding.y && encoding.y2) {
            // Limited vertical rule
            encoding.x2 = encoding.x;
        } else if (encoding.y && encoding.x && encoding.x2) {
            // Limited horizontal rule
            encoding.y2 = encoding.y;
        } else if (encoding.y && encoding.x) {
            if (
                !encoding.x2 &&
                isChannelDefWithScale(encoding.y) &&
                encoding.y.type == "quantitative"
            ) {
                encoding.x2 = encoding.x;
                encoding.y2 = { datum: 0 };
            } else if (
                !encoding.y2 &&
                isChannelDefWithScale(encoding.x) &&
                encoding.x.type == "quantitative"
            ) {
                encoding.y2 = encoding.y;
                encoding.x2 = { datum: 0 };
            } else {
                throw new Error("A bug!"); // Should be unreachable
            }
        } else {
            throw new Error(
                "Invalid x and y encodings for rule mark: " +
                    JSON.stringify(encoding)
            );
        }

        return encoding;
    }

    async initializeGraphics() {
        await super.initializeGraphics();

        if (this.properties.strokeDash) {
            const gl = this.gl;
            const textureData = createDashTextureArray(
                this.properties.strokeDash
            );
            this.dashTexture = createTexture(gl, {
                mag: gl.NEAREST,
                min: gl.NEAREST,
                internalFormat: gl.R8,
                format: gl.RED,
                src: textureData,
                height: 1,
            });
            this.dashTextureSize = textureData.length; // Not needed with WebGL2
        }

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER, [
            COMMON_SHADER,
        ]);
    }

    finalizeGraphicsInitialization() {
        super.finalizeGraphicsInitialization();

        this.gl.useProgram(this.programInfo.program);

        const props = this.properties;

        setBlockUniforms(this.markUniformInfo, {
            uMinLength: +props.minLength,
            uDashTextureSize: +this.dashTextureSize,
            uStrokeCap: ["butt", "square", "round"].indexOf(
                props.strokeCap ?? "butt"
            ),
        });
        setUniformBlock(this.gl, this.programInfo, this.markUniformInfo);
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
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
     * @param {import("../types/rendering.js").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        const ops = super.prepareRender(options);

        ops.push(() => {
            bindUniformBlock(this.gl, this.programInfo, this.markUniformInfo);
        });

        if (this.dashTexture) {
            ops.push(() =>
                setUniforms(this.programInfo, {
                    uDashTexture: this.dashTexture,
                })
            );
        }

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
}

/**
 *
 * @param {number[]} pattern
 */
function createDashTextureArray(pattern) {
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
