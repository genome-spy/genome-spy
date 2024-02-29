import { InternMap } from "internmap";
import { format } from "d3-format";
import { isString } from "vega-util";
import ArrayBuilder from "./arrayBuilder.js";
import { SDF_PADDING } from "../fonts/bmFontMetrics.js";
import { createBinningRangeIndexer } from "../utils/binnedIndex.js";
import { isValueDef } from "../encoder/encoder.js";
import {
    dedupeEncodingFields,
    isHighPrecisionScale,
    isLargeGenome,
    makeAttributeName,
    splitLargeHighPrecision,
} from "./glslScaleGenerator.js";
import { isContinuous } from "vega-scale";

/**
 * @typedef {object} RangeEntry Represents a location of a vertex subset
 * @prop {number} offset in vertices
 * @prop {number} count in vertices
 * @prop {import("../utils/binnedIndex.js").Lookup} xIndex
 */
export class GeometryBuilder {
    /**
     * @typedef {import("./arrayBuilder.js").ConverterMetadata} Converter
     * @typedef {import("../types/encoder.js").Encoder} Encoder
     */

    /**
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} [object.attributes]
     * @param {number} [object.numVertices] If the number of data items is known, a
     *      preallocated TypedArray is used
     */
    constructor({ encoders, numVertices = undefined, attributes = [] }) {
        this.encoders = encoders;

        // Encoders for variable channels
        this.variableEncoders = Object.fromEntries(
            Object.entries(encoders).filter(
                ([channel, e]) =>
                    attributes.includes(channel) && e && !e.constant
            )
        );

        const dedupedEncodingFields = [
            ...dedupeEncodingFields(encoders).entries(),
        ]
            .filter(([key, channels]) => key[1] && channels.length > 1)
            .map(([_key, channels]) => channels);

        this.allocatedVertices = numVertices;

        this.variableBuilder = new ArrayBuilder(numVertices);

        // Create converters and updaters for all variable channels.
        for (const [channel, ce] of Object.entries(this.variableEncoders)) {
            // Only add the first of the shared channels as all the rest are same
            // For example, if both x and x2 are using the same field, only x is
            // added to the array builder with the name "x_x2".
            const sharedChannels = dedupedEncodingFields.find((channels) =>
                channels.find((c) => c == channel)
            );
            if (sharedChannels && channel != sharedChannels[0]) {
                continue;
            }

            const accessor = ce.accessor;
            const numberAccessor = accessor.asNumberAccessor();
            const scale = ce.scale;
            const hp = scale && isHighPrecisionScale(scale.type);
            const largeHp = hp && isLargeGenome(scale.domain());
            const largeHpArray = [0, 0];

            const indexer = ce.indexer;

            /**
             * Discrete variables both numeric and strings must be "indexed",
             * 64 bit floats must be converted to vec2.
             * 32 bit continuous variables go to GPU as is.
             *
             * @type {function(any):(number | number[])}
             */
            const f = indexer
                ? (d) => indexer(accessor(d))
                : largeHp
                ? (d) =>
                      splitLargeHighPrecision(numberAccessor(d), largeHpArray)
                : numberAccessor;

            const attributeName = sharedChannels
                ? makeAttributeName(sharedChannels)
                : channel;

            this.variableBuilder.addConverter(attributeName, {
                f,
                numComponents: largeHp ? 2 : 1,
                arrayReference: largeHp ? largeHpArray : undefined,
                targetArrayType:
                    channel == "uniqueId"
                        ? Uint32Array
                        : indexer
                        ? Uint16Array
                        : hp
                        ? Uint32Array
                        : Float32Array,
            });
        }

        this.lastOffset = 0;

        /** @type {Map<any, RangeEntry>} keep track of facet locations within the vertex array */
        this.rangeMap = new InternMap([], JSON.stringify);
    }

    /**
     * Must be called at the end of `addBatch`
     *
     * @param {any} key
     */
    registerBatch(key) {
        const offset = this.lastOffset;
        const index = this.variableBuilder.vertexCount;
        const size = index - offset;
        if (size) {
            this.rangeMap.set(key, {
                offset,
                count: size,
                xIndex: this.xIndexer?.getIndex(),
            });
        }
        this.lastOffset = index;
    }

    /**
     * @param {Map<any, object[]>} batches
     */
    addBatches(batches) {
        for (const [key, data] of batches) {
            this.addBatch(key, data);
        }
    }

    /**
     * @param {any} key The facet id, for example
     * @param {object[]} data
     */
    addBatch(key, data, lo = 0, hi = data.length) {
        this.prepareXIndexer(data, lo, hi);

        for (let i = lo; i < hi; i++) {
            const d = data[i];
            this.variableBuilder.pushFromDatum(d);
            this.addToXIndex(d);
        }

        this.registerBatch(key);
    }

    /**
     * @param {import("../data/flowNode.js").Data} data Domain, but specified using datums
     * @param {number} [lo]
     * @param {number} [hi]
     */
    prepareXIndexer(data, lo = 0, hi = lo + data.length) {
        const disable = () => {
            /**
             * @param {import("../data/flowNode.js").Datum} datum
             */
            this.addToXIndex = (datum) => {
                // nop
            };
            this.xIndexer = undefined;
        };

        const channelDef = this.encoders.x?.channelDef;
        if (
            !("buildIndex" in channelDef) ||
            !channelDef.buildIndex ||
            !data.length ||
            hi - lo < 0
        ) {
            disable();
            return;
        }

        /** @param {Encoder} encoder */
        const getContinuousEncoder = (encoder) =>
            encoder && isContinuous(encoder.scale?.type) && encoder;

        const xe = getContinuousEncoder(this.variableEncoders.x);
        const x2e = getContinuousEncoder(this.variableEncoders.x2);

        if (xe) {
            const xa = xe.accessor.asNumberAccessor();
            const x2a = x2e ? x2e.accessor.asNumberAccessor() : xa;

            /** @type {[number, number]} */
            const dataDomain = [xa(data[lo]), x2a(data[hi - 1])];

            // No indexer for point domains that have zero extent
            if (dataDomain[1] > dataDomain[0]) {
                this.xIndexer = createBinningRangeIndexer(
                    50,
                    dataDomain,
                    xa,
                    x2a
                );

                let lastVertexCount = this.variableBuilder.vertexCount;

                /**
                 * @param {any} datum
                 */
                this.addToXIndex = (datum) => {
                    let currentVertexCount = this.variableBuilder.vertexCount;
                    this.xIndexer(datum, lastVertexCount, currentVertexCount);
                    lastVertexCount = currentVertexCount;
                };
            } else {
                disable();
            }
        } else {
            disable();
        }
    }

    /**
     * Add the datum to an index, which allows for efficient rendering of ranges
     * on the x axis. Must be called after a datum has been pushed to the ArrayBuilder.
     *
     * @param {import("../data/flowNode.js").Datum} datum
     */
    addToXIndex(datum) {
        //
    }

    toArrays() {
        return {
            /** @type {Record<string, {data: Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array, numComponents: number, divisor?: number}>} */
            arrays: this.variableBuilder.arrays,
            /** Number of vertices used */
            vertexCount: this.variableBuilder.vertexCount,
            /** Number of vertices allocated in buffers */
            allocatedVertices: this.allocatedVertices,
            rangeMap: this.rangeMap,
        };
    }
}

export class RectVertexBuilder extends GeometryBuilder {
    /**
     *
     * @param {Object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {number} [object.numItems] Number of data items
     */
    constructor({ encoders, attributes, numItems }) {
        super({
            encoders,
            attributes,
            numVertices: numItems * 6,
        });
        this.variableBuilder.configure();

        const pushAll = this.variableBuilder.pushAll;

        this.pushAllSixTimes =
            // TODO: Don't do this stupid comparison. Instead, reuse the previous GeometryBuilder.
            numItems > 500
                ? // Make a new function instance where the JS engine can inline
                  // all pushAll calls to avoid the function call overhead.
                  new Function(
                      "pushAll",
                      `return function unrolledPushAllSixTimes() {
  pushAll(); pushAll(); pushAll(); pushAll(); pushAll(); pushAll();
};`
                  )(pushAll)
                : function pushAllSixTimes() {
                      pushAll();
                      pushAll();
                      pushAll();
                      pushAll();
                      pushAll();
                      pushAll();
                  };
    }

    /**
     *
     * @param {any} key
     * @param {object[]} data
     */
    addBatch(key, data, lo = 0, hi = data.length) {
        if (hi <= lo) {
            return;
        }

        this.prepareXIndexer(data, lo, hi);

        for (let i = lo; i < hi; i++) {
            const d = data[i];

            // Start a new segment.
            this.variableBuilder.updateFromDatum(d);

            // Six vertices per rect. The vertex shader is using gl_VertexID to
            // determine the vertex position within the rect.
            this.pushAllSixTimes();

            this.addToXIndex(d);
        }

        this.registerBatch(key);
    }
}

export class RuleVertexBuilder extends GeometryBuilder {
    /**
     *
     * @param {Object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {number} [object.tessellationThreshold]
     *     If the rule is wider than the threshold, tessellate it into pieces
     * @param {number[]} [object.visibleRange]
     * @param {number} [object.numItems] Number of data items
     */
    constructor({
        encoders,
        attributes,
        tessellationThreshold = Infinity,
        visibleRange = [-Infinity, Infinity],
        numItems,
    }) {
        super({
            encoders,
            attributes,
            numVertices:
                tessellationThreshold == Infinity ? numItems * 6 : undefined,
        });

        this.visibleRange = visibleRange;

        this.tessellationThreshold = tessellationThreshold || Infinity;

        this.updateSide = this.variableBuilder.createUpdater("side", 1);
        this.updatePos = this.variableBuilder.createUpdater("pos", 1);

        this.variableBuilder.configure();
    }

    /* eslint-disable complexity */
    /**
     *
     * @param {any} key
     * @param {object[]} data
     */
    addBatch(key, data, lo = 0, hi = data.length) {
        //const [lower, upper] = this.visibleRange; // TODO

        this.prepareXIndexer(data, lo, hi);

        for (let i = lo; i < hi; i++) {
            const d = data[i];

            // Start a new rule. Duplicate the first vertex to produce degenerate triangles
            this.variableBuilder.updateFromDatum(d);
            this.updateSide(-0.5);
            this.updatePos(0);
            this.variableBuilder.pushAll();

            // Tesselate segments
            const tileCount = 1;
            //    width < Infinity
            //        ? Math.ceil(width / this.tessellationThreshold)
            //        : 1;
            for (let i = 0; i <= tileCount; i++) {
                this.updatePos(i / tileCount);
                this.updateSide(-0.5);
                this.variableBuilder.pushAll();
                this.updateSide(0.5);
                this.variableBuilder.pushAll();
            }

            // Duplicate the last vertex to produce a degenerate triangle between the rules
            this.variableBuilder.pushAll();
            this.addToXIndex(d);
        }

        this.registerBatch(key);
    }
}

export class PointVertexBuilder extends GeometryBuilder {
    /**
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {number} [object.numItems] Number of points if known, uses TypedArray
     */
    constructor({ encoders, attributes, numItems = undefined }) {
        super({
            encoders,
            attributes,
            numVertices: numItems,
        });
        this.variableBuilder.configure();
    }
}

export class LinkVertexBuilder extends GeometryBuilder {
    /**
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {number} [object.numItems ] Number of points if known, uses TypedArray
     */
    constructor({ encoders, attributes, numItems = undefined }) {
        super({
            encoders,
            attributes,
            numVertices: numItems,
        });
        this.variableBuilder.configure();
    }

    toArrays() {
        const arrays = this.variableBuilder.arrays;

        // Prepare for instanced rendering
        for (let a of Object.values(arrays)) {
            a.divisor = 1;
        }

        return super.toArrays();
    }
}

export class TextVertexBuilder extends GeometryBuilder {
    /**
     *
     * @param {object} object
     * @param {Record<string, Encoder>} object.encoders
     * @param {string[]} object.attributes
     * @param {import("../fonts/bmFontMetrics.js").BMFontMetrics} object.fontMetrics
     * @param {Record<string, any>} object.properties
     * @param {number} [object.numCharacters] number of characters
     * @param {boolean} [object.logoLetters]
     */
    constructor({
        encoders,
        attributes,
        fontMetrics,
        properties,
        numCharacters = undefined,
    }) {
        super({
            encoders,
            attributes,
            numVertices: numCharacters * 6, // six vertices per quad (character)
        });

        this.metadata = fontMetrics;
        this.metrics = fontMetrics;

        this.properties = properties;

        const e = encoders;

        const channelDef =
            /** @type {import("../spec/channel.js").TextDef<string>} */ (
                e.text.channelDef
            );
        /** @type {(value: any) => string} */
        this.numberFormat =
            !isValueDef(channelDef) &&
            "format" in channelDef &&
            channelDef.format
                ? format(channelDef.format)
                : (d) => d;

        this.updateVertexCoord = this.variableBuilder.createUpdater(
            "vertexCoord",
            2
        );
        this.updateTextureCoord = this.variableBuilder.createUpdater(
            "textureCoord",
            2
        );

        this.updateWidth = this.variableBuilder.createUpdater("width", 1);

        this.variableBuilder.configure();
    }

    /**
     *
     * @param {any} key
     * @param {object[]} data
     */
    addBatch(key, data, lo = 0, hi = data.length) {
        const align = this.properties.align || "left";
        const logoLetters = this.properties.logoLetters ?? false;

        const base = this.metadata.common.base;
        const scale = this.metadata.common.scaleH; // Assume square textures

        let baseline = -SDF_PADDING;
        switch (this.properties.baseline) {
            case "top":
                baseline += this.metrics.capHeight;
                break;
            case "middle":
                baseline += this.metrics.capHeight / 2;
                break;
            case "bottom":
                baseline -= this.metrics.descent;
                break;
            default:
            // alphabetic
        }

        const accessor = this.encoders.text.accessor || this.encoders.text; // accessor or constant value

        const vertexCoord = [0, 0];
        this.updateVertexCoord(vertexCoord);
        const textureCoord = [0, 0];
        this.updateTextureCoord(textureCoord);

        this.prepareXIndexer(data, lo, hi);

        for (let i = lo; i < hi; i++) {
            const d = data[i];

            const value = this.numberFormat(accessor(d));
            const str = isString(value)
                ? value
                : value === null
                ? ""
                : "" + value;
            if (str.length == 0) continue;

            this.variableBuilder.updateFromDatum(d);

            const textWidth = logoLetters
                ? str.length
                : this.metrics.measureWidth(str);

            this.updateWidth(textWidth); // TODO: Check if one letter space should be reduced

            let x =
                align == "right"
                    ? -textWidth
                    : align == "center"
                    ? -textWidth / 2
                    : 0;

            if (!logoLetters) {
                const firstChar = this.metrics.getCharByCode(str.charCodeAt(0));
                x -= (firstChar.width - firstChar.xadvance) / base / 2; // TODO: Fix, this is a bit off..
            }

            let bottom = -0.5,
                height = 1,
                normalWidth = 1;

            for (let i = 0; i < str.length; i++) {
                const c = this.metrics.getCharByCode(str.charCodeAt(i));

                const advance = logoLetters ? 1 : c.xadvance / base;

                if (c.id == 32) {
                    x += advance;
                    continue;
                }

                if (!logoLetters) {
                    height = c.height / base;
                    bottom = -(c.height + c.yoffset + baseline) / base;
                    normalWidth = c.width / base;
                } else {
                    normalWidth = (c.width + SDF_PADDING * 2) / c.width;
                    x = -normalWidth / 2;
                    height = (c.height + SDF_PADDING * 2) / c.height;
                    bottom = -0.5 - SDF_PADDING / c.height;
                }

                const tx = c.x;
                const ty = c.y;

                vertexCoord[0] = x;
                vertexCoord[1] = bottom + height;
                textureCoord[0] = tx / scale;
                textureCoord[1] = ty / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x + normalWidth;
                vertexCoord[1] = bottom + height;
                textureCoord[0] = (tx + c.width) / scale;
                textureCoord[1] = ty / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x;
                vertexCoord[1] = bottom;
                textureCoord[0] = tx / scale;
                textureCoord[1] = (ty + c.height) / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x + normalWidth;
                vertexCoord[1] = bottom + height;
                textureCoord[0] = (tx + c.width) / scale;
                textureCoord[1] = ty / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x;
                vertexCoord[1] = bottom;
                textureCoord[0] = tx / scale;
                textureCoord[1] = (ty + c.height) / scale;
                this.variableBuilder.pushAll();

                vertexCoord[0] = x + normalWidth;
                vertexCoord[1] = bottom;
                textureCoord[0] = (tx + c.width) / scale;
                textureCoord[1] = (ty + c.height) / scale;
                this.variableBuilder.pushAll();

                x += advance;
            }

            this.addToXIndex(d);
        }

        this.registerBatch(key);
    }
}
