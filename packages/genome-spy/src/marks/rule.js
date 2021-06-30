import Mark from "./mark.js";
import {
    createTexture,
    drawBufferInfo,
    setBuffersAndAttributes,
    setUniforms
} from "twgl.js";
import VERTEX_SHADER from "../gl/rule.vertex.glsl";
import FRAGMENT_SHADER from "../gl/rule.fragment.glsl";
import { RuleVertexBuilder } from "../gl/dataToVertices";

export default class RuleMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        this.dashTextureSize = 0;
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
            "opacity"
        ];
    }

    getSupportedChannels() {
        return [...super.getSupportedChannels(), "x2", "y2", "size"];
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),

            x2: undefined,
            y2: undefined,
            size: 1,
            color: "black",
            opacity: 1.0,

            minLength: 0.0,
            /** @type {number[]} */
            strokeDash: null,
            strokeDashOffset: 0,
            strokeCap: "butt"
        };
    }

    /**
     * @param {import("../spec/channel").Encoding} encoding
     * @returns {import("../spec/channel").Encoding}
     */
    // eslint-disable-next-line complexity
    fixEncoding(encoding) {
        // TODO: Write test for this mess
        if (encoding.x && encoding.y && encoding.x2 && encoding.y2) {
            // Everything is defined
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
            if (!encoding.x2 && encoding.y.type == "quantitative") {
                encoding.x2 = encoding.x;
                encoding.y2 = { datum: 0 };
            } else if (!encoding.y2 && encoding.x.type == "quantitative") {
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
                height: 1
            });
            this.dashTextureSize = textureData.length; // Not needed with WebGL2
        }

        this.createAndLinkShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        const collector = this.unitView.getCollector();
        const itemCount = collector.getItemCount();

        const builder = new RuleVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems: Math.max(itemCount, this.properties.minBufferSize || 0),
            buildXIndex: this.properties.buildIndex
        });

        builder.addBatches(collector.facetBatches);

        const vertexData = builder.toArrays();
        this.rangeMap = vertexData.rangeMap;

        this.updateBufferInfo(vertexData);
    }

    /**
     * @param {import("../view/rendering").GlobalRenderingOptions} options
     */
    prepareRender(options) {
        super.prepareRender(options);

        setUniforms(this.programInfo, {
            uMinLength: this.properties.minLength,
            uDashTextureSize: this.dashTextureSize,
            uStrokeCap: ["butt", "square", "round"].indexOf(
                this.properties.strokeCap
            )
        });

        if (this.dashTexture) {
            setUniforms(this.programInfo, {
                uDashTexture: this.dashTexture,
                uStrokeDashOffset: this.properties.strokeDashOffset
            });
        }

        setBuffersAndAttributes(
            this.gl,
            this.programInfo,
            this.vertexArrayInfo
        );
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
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
            options,
            () => this.rangeMap
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
        pattern.findIndex(s => Math.round(s) != s || s < 1 || s > 1000) >= 0
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
