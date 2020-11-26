import Mark from "./mark.js";
import * as twgl from "twgl.js";
import VERTEX_SHADER from "../gl/rule.vertex.glsl";
import FRAGMENT_SHADER from "../gl/rule.fragment.glsl";
import { RuleVertexBuilder } from "../gl/dataToVertices";

/** @type {import("../spec/view").EncodingConfigs} */
const defaultEncoding = {
    x: null,
    x2: null,
    y: null,
    y2: null,
    size: { value: 1 },
    color: { value: "black" },
    opacity: { value: 1.0 }
};

/**
 * Rule mark is just a special case of rect mark. However, it provides
 * a more straightforward configuration for rules.
 */
export default class RuleMark extends Mark {
    /**
     * @param {import("../view/unitView").default} unitView
     */
    constructor(unitView) {
        super(unitView);

        this.dashTextureSize = 0;
    }

    getAttributes() {
        return {
            x: { raw: true },
            x2: { raw: true },
            y: { raw: true },
            y2: { raw: true },
            size: { raw: true },
            color: {},
            opacity: { raw: true }
        };
    }

    getDefaultEncoding() {
        return { ...super.getDefaultEncoding(), ...defaultEncoding };
    }

    getDefaultProperties() {
        return {
            ...super.getDefaultProperties(),
            minLength: 0.0,
            /** @type {number[]} */
            strokeDash: null,
            strokeDashOffset: 0,
            strokeCap: "butt"
        };
    }

    // eslint-disable-next-line complexity
    getEncoding() {
        const encoding = {
            ...this.getDefaultEncoding(),
            ...this.unitView.getEncoding()
        };

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
            this.dashTexture = twgl.createTexture(gl, {
                mag: gl.NEAREST,
                min: gl.NEAREST,
                internalFormat: gl.R8,
                format: gl.RED,
                src: textureData,
                height: 1
            });
            this.dashTextureSize = textureData.length; // Not needed with WebGL2
        }

        this.createShaders(VERTEX_SHADER, FRAGMENT_SHADER);
    }

    updateGraphicsData() {
        const itemCount = [...this.dataByFacet.values()]
            .map(arr => arr.length)
            .reduce((a, c) => a + c, 0);

        const builder = new RuleVertexBuilder({
            encoders: this.encoders,
            attributes: this.getAttributes(),
            numItems: Math.max(itemCount, this.properties.minBufferSize || 0)
        });

        for (const [sample, d] of this.dataByFacet.entries()) {
            builder.addBatch(sample, d);
        }
        const vertexData = builder.toArrays();
        this.rangeMap = vertexData.rangeMap;

        this.updateBufferInfo(vertexData);
    }

    prepareRender() {
        super.prepareRender();

        twgl.setUniforms(this.programInfo, {
            uMinLength: this.properties.minLength,
            uDashTextureSize: this.dashTextureSize,
            uStrokeCap: ["butt", "square", "round"].indexOf(
                this.properties.strokeCap
            )
        });

        if (this.dashTexture) {
            twgl.setUniforms(this.programInfo, {
                uDashTexture: this.dashTexture,
                uStrokeDashOffset: this.properties.strokeDashOffset
            });
        }

        twgl.setBuffersAndAttributes(
            this.gl,
            this.programInfo,
            this.bufferInfo
        );
    }

    /**
     * @param {import("./Mark").MarkRenderingOptions} options
     */
    render(options) {
        const gl = this.gl;

        return this.createRenderCallback(
            range =>
                twgl.drawBufferInfo(
                    gl,
                    this.vertexArrayInfo,
                    gl.TRIANGLE_STRIP,
                    range.count,
                    range.offset
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
