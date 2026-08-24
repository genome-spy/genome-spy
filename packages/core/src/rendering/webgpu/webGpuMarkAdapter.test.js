import { describe, expect, test, vi } from "vitest";
import { InternMap } from "internmap";

import Rectangle from "../../view/layout/rectangle.js";
import { bandScaleDefinition } from "@genome-spy/webgpu-renderer/scales/band";
import { identityScaleDefinition } from "@genome-spy/webgpu-renderer/scales/identity";
import { indexScaleDefinition } from "@genome-spy/webgpu-renderer/scales/index";
import { linearScaleDefinition } from "@genome-spy/webgpu-renderer/scales/linear";
import { thresholdScaleDefinition } from "@genome-spy/webgpu-renderer/scales/threshold";
import PlacementSource from "../../view/layout/placementSource.js";
import {
    createWebGpuMarkConfig,
    getPackedMarkData,
    getPackedMarkRange,
} from "./webGpuMarkAdapter.js";

describe("WebGPU mark adapter", () => {
    test("packs and caches a 2,000-instance placement-index series", () => {
        const data = Array.from({ length: 2000 }, (_, index) => ({ index }));
        const facetIndex = createEncoder((datum) => datum.index);
        const mark = createMark("point", data, { facetIndex });

        const first = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const second = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const firstPlacement = /** @type {any} */ (first).config.placementIndex;
        const secondPlacement = /** @type {any} */ (second).config
            .placementIndex;

        expect(firstPlacement.data).toBeInstanceOf(Uint32Array);
        expect(firstPlacement.data).toHaveLength(2000);
        expect(firstPlacement.data.byteLength).toBe(8000);
        expect(firstPlacement.data[1999]).toBe(1999);
        expect(secondPlacement.data).toBe(firstPlacement.data);
        expect(facetIndex).toHaveBeenCalledTimes(2000);
    });

    test("packs complete topology independently of active occurrences", () => {
        const firstFacet = ["first"];
        const hiddenFacet = ["hidden"];
        const lastFacet = ["last"];
        const firstData = [{ x: 1 }];
        const lastData = [{ x: 2 }, { x: 3 }];
        const collector = {
            dataRevision: 4,
            facetBatches: new InternMap(
                [
                    [undefined, []],
                    [firstFacet, firstData],
                    [lastFacet, lastData],
                ],
                JSON.stringify
            ),
        };
        const mark = /** @type {any} */ ({
            unitView: {
                getCollector: () => collector,
                getPathString: () => "test",
            },
        });
        const source = new PlacementSource();
        source.replaceTopology(
            [firstFacet, hiddenFacet, lastFacet],
            new Float32Array(12)
        );

        const packed = getPackedMarkData(mark, source);
        expect(packed.data).toEqual([...firstData, ...lastData]);
        const facetLookup = vi.spyOn(collector.facetBatches, "get");
        facetLookup.mockClear();
        expect(
            getPackedMarkRange(
                mark,
                { placement: { source, index: 1 } },
                packed
            )
        ).toEqual({ firstInstance: 1, instanceCount: 0 });
        expect(
            getPackedMarkRange(
                mark,
                { placement: { source, index: 2 } },
                packed
            )
        ).toEqual({ firstInstance: 1, instanceCount: 2 });
        expect(getPackedMarkData(mark, source)).toBe(packed);
        expect(facetLookup).not.toHaveBeenCalled();
    });

    test("packs facet batches larger than the function argument limit", () => {
        const facetId = ["large"];
        const batch = Array.from({ length: 200_000 }, (_, index) => ({
            index,
        }));
        const collector = {
            dataRevision: 1,
            facetBatches: new InternMap([[facetId, batch]], JSON.stringify),
        };
        const mark = /** @type {any} */ ({
            unitView: { getCollector: () => collector },
        });
        const source = new PlacementSource();
        source.replaceTopology([facetId], new Float32Array(4));

        const packed = getPackedMarkData(mark, source);

        expect(packed.data).toHaveLength(batch.length);
        expect(packed.data[0]).toBe(batch[0]);
        expect(packed.data.at(-1)).toBe(batch.at(-1));
        expect(packed.placementRanges).toEqual([
            { firstInstance: 0, instanceCount: batch.length },
        ]);
    });

    test("keeps raw point data and maps unit scale ranges to view pixels", () => {
        const data = [
            { x: 0, y: -1 },
            { x: 2, y: 1 },
        ];
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x, {
                scale: createLinearScale([0, 2]),
            }),
            y: createEncoder((datum) => datum.y, {
                scale: createLinearScale([-1, 1]),
            }),
            size: createConstantEncoder(64),
            shape: createConstantEncoder("circle"),
            strokeWidth: createConstantEncoder(0),
            xOffset: createConstantEncoder(0),
            yOffset: createConstantEncoder(0),
            fill: createConstantEncoder("#336699"),
            stroke: createConstantEncoder(null),
            fillOpacity: createConstantEncoder(0.75),
            strokeOpacity: createConstantEncoder(1),
            angle: createConstantEncoder(0),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.create(10, 20, 100, 200),
            0.5
        );
        if (!translated) {
            throw new Error("Expected a translated point mark.");
        }

        expect(translated.definition.type).toBe("point");
        const channels = /** @type {any} */ (translated.config).channels;
        expect(channels.x).toEqual({
            data: new Float32Array([0, 2]),
            type: "f32",
            scale: {
                type: "linear",
                definition: linearScaleDefinition,
                domain: [0, 2],
                range: [10, 110],
                clamp: false,
            },
        });
        expect(channels.y).toEqual({
            data: new Float32Array([-1, 1]),
            type: "f32",
            scale: {
                type: "linear",
                definition: linearScaleDefinition,
                domain: [-1, 1],
                range: [220, 20],
                clamp: false,
            },
        });
        expect(channels.fill.value).toEqual([0.2, 0.4, 0.6, 1]);
        expect(channels.fillOpacity).toEqual({ value: 0.375 });
    });

    test("reverses continuous Y scale ranges when requested", () => {
        const mark = createMark("point", [{ y: 0 }], {
            x: createConstantEncoder(0.5),
            y: createEncoder((datum) => datum.y, {
                scale: createLinearScale([0, 1], true),
            }),
            size: createConstantEncoder(4),
            shape: createConstantEncoder("circle"),
            strokeWidth: createConstantEncoder(0),
            fill: createConstantEncoder("black"),
            stroke: createConstantEncoder(null),
            fillOpacity: createConstantEncoder(1),
            strokeOpacity: createConstantEncoder(1),
            angle: createConstantEncoder(0),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.create(10, 20, 100, 200)
        );
        if (!translated) {
            throw new Error("Expected a translated point mark.");
        }

        const channels = /** @type {any} */ (translated.config).channels;
        expect(channels.y.scale.range).toEqual([20, 220]);
    });

    test("combines text offsets and uses the embedded font for Core defaults", () => {
        const data = [
            { label: "A", offset: 2 },
            { label: "B", offset: -3 },
        ];
        const mark = createMark(
            "text",
            data,
            {
                x: createConstantEncoder(0.5),
                y: createConstantEncoder(1),
                text: createEncoder((datum) => datum.label),
                size: createConstantEncoder(11),
                angle: createConstantEncoder(0),
                xOffset: createEncoder((datum) => datum.offset),
                yOffset: createConstantEncoder(9),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                align: "center",
                baseline: "top",
                font: "sans-serif",
                fontStyle: "normal",
                fontWeight: 400,
                paddingX: 0,
                paddingY: 0,
                flushX: false,
                flushY: false,
                squeeze: false,
            }
        );

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.create(10, 20, 100, 200)
        );
        if (!translated) {
            throw new Error("Expected a translated text mark.");
        }

        const config = /** @type {any} */ (translated.config);
        expect(config.channels.x).toEqual({
            value: 60,
            scale: {
                type: "identity",
                definition: identityScaleDefinition,
            },
        });
        expect(config.channels.y).toEqual({
            value: 20,
            scale: {
                type: "identity",
                definition: identityScaleDefinition,
            },
        });
        expect(config.channels.text).toEqual({ data: ["A", "B"] });
        expect(config.channels.dx).toEqual({
            data: new Float32Array([2, -3]),
            type: "f32",
        });
        expect(config.channels.dy).toEqual({ value: 9 });
        expect(config.font).toBe("Lato");
        expect(config.viewport).toEqual([10, 20, 110, 220]);
        expect(config.dynamicValues.uViewport).toEqual({
            value: [10, 20, 110, 220],
        });
    });

    test("passes Core-loaded custom font resources to the renderer", () => {
        const mark = createMark(
            "text",
            [{ label: "A" }],
            {
                x: createConstantEncoder(0),
                y: createConstantEncoder(0),
                text: createEncoder((datum) => datum.label),
                size: createConstantEncoder(11),
                angle: createConstantEncoder(0),
                xOffset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                font: "Test Sans",
                fontStyle: "italic",
                fontWeight: 700,
                align: "center",
                baseline: "middle",
                paddingX: 0,
                paddingY: 0,
                flushX: false,
                flushY: false,
                squeeze: false,
            }
        );
        const fontResource = {
            metrics: /** @type {any} */ ({}),
            bitmapUrl: "test-sans.png",
        };
        Object.assign(mark, { font: fontResource });

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.ZERO
        );
        if (!translated) {
            throw new Error("Expected a translated text mark.");
        }

        expect(translated.config).toMatchObject({
            font: "Test Sans",
            fontResource: {
                metrics: fontResource.metrics,
                bitmap: "test-sans.png",
            },
            fontStyle: "italic",
            fontWeight: 700,
        });
    });

    test("applies the text channel number format", () => {
        const data = [{ value: 1.2345 }, { value: -0.5 }];
        const mark = createMark(
            "text",
            data,
            {
                x: createConstantEncoder(0),
                y: createConstantEncoder(0),
                text: createEncoder((datum) => datum.value, {
                    channelDef: { field: "value", format: ".2f" },
                }),
                size: createConstantEncoder(11),
                angle: createConstantEncoder(0),
                xOffset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                align: "center",
                baseline: "middle",
                font: "sans-serif",
                fontStyle: "normal",
                fontWeight: 400,
                paddingX: 0,
                paddingY: 0,
                flushX: false,
                flushY: false,
                squeeze: false,
            }
        );

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

        expect(
            /** @type {any} */ (translated).config.channels.text.data
        ).toEqual(["1.23", "−0.50"]);
    });

    test("maps categorical positions to stable band-scale identifiers", () => {
        const data = [{ category: "A" }, { category: "B" }];
        const domain = ["A", "B"];
        const xOptions = {
            scale: createBandScale(domain),
            channelDef: {
                field: "category",
                type: "nominal",
                band: 0.5,
            },
        };
        const mark = createMark(
            "rule",
            data,
            {
                x: createEncoder((datum) => datum.category, xOptions),
                x2: createEncoder((datum) => datum.category, xOptions),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createConstantEncoder(0),
                x2Offset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                y2Offset: createConstantEncoder(0),
                size: createConstantEncoder(1),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                strokeDash: null,
                minLength: 0,
                strokeCap: "butt",
                strokeDashOffset: 0,
            }
        );

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const x = /** @type {any} */ (translated).config.channels.x;

        domain.reverse();
        const updated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const updatedX = /** @type {any} */ (updated).config.channels.x;

        expect(x.data).toEqual(new Uint32Array([0, 1]));
        expect(x.type).toBe("u32");
        expect(x.scale).toEqual({
            type: "band",
            definition: bandScaleDefinition,
            domain: [0, 1],
            range: [10, 110],
            paddingInner: 0.2,
            paddingOuter: 0.1,
            align: 0.5,
            band: 0.5,
        });
        expect(updatedX.data).toBe(x.data);
        expect(updatedX.scale.domain).toEqual([1, 0]);
    });

    test("keeps reversed discrete Y scales top-to-bottom", () => {
        const data = [{ category: "A" }, { category: "B" }];
        const yOptions = {
            scale: createBandScale(["A", "B"], true),
            channelDef: {
                field: "category",
                type: "nominal",
                band: 0.5,
            },
        };
        const mark = createMark("point", data, {
            x: createConstantEncoder(0.5),
            y: createEncoder((datum) => datum.category, yOptions),
            size: createConstantEncoder(4),
            shape: createConstantEncoder("circle"),
            strokeWidth: createConstantEncoder(0),
            xOffset: createConstantEncoder(0),
            yOffset: createConstantEncoder(0),
            fill: createConstantEncoder("black"),
            stroke: createConstantEncoder(null),
            fillOpacity: createConstantEncoder(1),
            strokeOpacity: createConstantEncoder(1),
            angle: createConstantEncoder(0),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const y = /** @type {any} */ (translated).config.channels.y;

        expect(y.scale.range).toEqual([20, 220]);
    });

    test("translates a rule dash pattern to the renderer atlas config", () => {
        const mark = createMark(
            "rule",
            [{ x: 0, x2: 1 }],
            {
                x: createConstantEncoder(0),
                x2: createConstantEncoder(1),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createConstantEncoder(0),
                x2Offset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                y2Offset: createConstantEncoder(0),
                size: createConstantEncoder(2),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                strokeDash: [3, 2],
                strokeDashOffset: 1,
                minLength: 0,
                strokeCap: "round",
            }
        );

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const config = /** @type {any} */ (translated).config;

        expect(config.channels.strokeDash).toEqual({
            value: 0,
            type: "u32",
        });
        expect(config.dashPatterns).toEqual([[3, 2]]);
        expect(config.channels.strokeDashOffset).toEqual({ value: 1 });
    });

    test("translates link geometry and rendering properties", () => {
        const mark = createMark(
            "link",
            [{}],
            {
                x: createConstantEncoder(0),
                x2: createConstantEncoder(1),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createConstantEncoder(2),
                x2Offset: createConstantEncoder(3),
                yOffset: createConstantEncoder(4),
                y2Offset: createConstantEncoder(5),
                size: createConstantEncoder(2),
                color: createConstantEncoder("#336699"),
                opacity: createConstantEncoder(1),
            },
            {
                linkShape: "dome",
                orient: "horizontal",
                arcFadingDistance: [10, 20],
                arcHeightFactor: 0.75,
                minArcHeight: 3,
                clampApex: true,
                maxChordLength: 100,
                segments: 25,
            }
        );

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const config = /** @type {any} */ (translated).config;

        expect(translated.definition.type).toBe("link");
        expect(config.channels.xOffset).toEqual({ value: 2 });
        expect(config.channels.y2Offset).toEqual({ value: 5 });
        expect(config.linkShape).toBe(1);
        expect(config.orient).toBe(1);
        expect(config.arcFadingDistance).toEqual([10, 20]);
        expect(config.segments).toBe(25);
    });

    test("translates arrow geometry and rendering properties", () => {
        const data = [{ direction: "forward" }, { direction: "reverse" }];
        const mark = createMark(
            "arrow",
            data,
            {
                x: createConstantEncoder(0),
                x2: createConstantEncoder(1),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createConstantEncoder(2),
                x2Offset: createConstantEncoder(3),
                yOffset: createConstantEncoder(4),
                y2Offset: createConstantEncoder(5),
                fill: createConstantEncoder("#336699"),
                stroke: createConstantEncoder("black"),
                fillOpacity: createConstantEncoder(0.8),
                strokeOpacity: createConstantEncoder(0.7),
                strokeWidth: createConstantEncoder(2),
                size: createConstantEncoder(8),
                direction: createEncoder((datum) => datum.direction),
            },
            {
                headAngle: 45,
                headNotchAngle: 90,
                headShape: "open",
                headPlacement: "outside",
                headWidth: 3,
                headSpacing: 10,
                stem: true,
            }
        );

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const config = /** @type {any} */ (translated).config;

        expect(translated.definition.type).toBe("arrow");
        expect(config.channels.xOffset).toEqual({ value: 2 });
        expect(config.channels.y2Offset).toEqual({ value: 5 });
        expect(config.channels.direction).toEqual({
            data: new Uint32Array([0, 1]),
            type: "u32",
        });
        expect(config.headShape).toBe(1);
        expect(config.headPlacement).toBe(1);
        expect(config.headSpacing).toBe(10);
    });

    test("retains expression-driven arrow properties as extra uniforms", () => {
        const mark = createMark(
            "arrow",
            [{}],
            {
                x: createConstantEncoder(0),
                x2: createConstantEncoder(1),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createConstantEncoder(0),
                x2Offset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                y2Offset: createConstantEncoder(0),
                fill: createConstantEncoder("black"),
                stroke: createConstantEncoder(null),
                fillOpacity: createConstantEncoder(1),
                strokeOpacity: createConstantEncoder(1),
                strokeWidth: createConstantEncoder(1),
                size: createConstantEncoder(8),
                direction: createConstantEncoder("forward"),
            },
            { headWidth: { expr: "width" } }
        );
        const requestRender = vi.fn();
        const watchExpression = vi.fn();
        /** @type {any} */ (mark.unitView).paramRuntime = {
            evaluateAndGet: () => 7,
            watchExpression,
        };
        /** @type {any} */ (mark.unitView).context = {
            animator: { requestRender },
        };

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const config = /** @type {any} */ (translated).config;

        expect(config.dynamicValues).toEqual({
            uHeadWidth: { value: 7 },
        });
        expect(watchExpression).toHaveBeenCalledWith(
            "width",
            expect.any(Function)
        );
    });

    test.each([
        ["x", 12],
        ["+", 13],
    ])(
        "maps the stroke-only point shape %s to renderer code %i",
        (shape, code) => {
            const mark = createMark("point", [{}], {
                shape: createConstantEncoder(shape),
            });
            const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

            expect(
                /** @type {any} */ (translated).config.channels.shape
            ).toEqual({
                value: code,
                type: "u32",
            });
        }
    );

    test("maps regular index positions to a single u32 component", () => {
        const data = [{ x: 4 }, { x: 9 }];
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x, {
                scale: createIndexScale([3, 10]),
                channelDef: {
                    field: "x",
                    type: "index",
                    band: 0.25,
                },
            }),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const x = /** @type {any} */ (translated).config.channels.x;

        expect(x).toEqual({
            data: new Uint32Array([4, 9]),
            type: "u32",
            scale: {
                type: "index",
                definition: indexScaleDefinition,
                domain: [3, 10],
                range: [10, 110],
                paddingInner: 0.2,
                paddingOuter: 0.1,
                align: 0.5,
                band: 0.25,
            },
        });
    });

    test("floors fractional index positions", () => {
        const data = [{ x: 4.9 }, { x: 9.1 }];
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x, {
                scale: createIndexScale([3, 10]),
                channelDef: { field: "x", type: "index" },
            }),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const x = /** @type {any} */ (translated).config.channels.x;

        expect(x.data).toEqual(new Uint32Array([4, 9]));
    });

    test("maps large index positions to packed high-precision series", () => {
        const data = [{ x: 2 ** 32 + 4 }, { x: 2 ** 32 + 9 }];
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x, {
                scale: createIndexScale([2 ** 32, 2 ** 32 + 10]),
                channelDef: {
                    field: "x",
                    type: "index",
                    band: 0.25,
                },
            }),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const x = /** @type {any} */ (translated).config.channels.x;

        expect(x.data).toEqual(new Uint32Array([1048576, 4, 1048576, 9]));
        expect(x.inputComponents).toBe(2);
    });

    test("translates renderer-supported nonlinear position scales", () => {
        const data = [{ x: 1 }, { x: 10 }];
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x, {
                scale: {
                    type: "log",
                    domain: () => [1, 100],
                    base: () => 10,
                    clamp: () => true,
                },
                channelDef: { field: "x", type: "quantitative" },
            }),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );

        expect(/** @type {any} */ (translated).config.channels.x.scale).toEqual(
            expect.objectContaining({
                type: "log",
                domain: [1, 100],
                range: [10, 110],
                base: 10,
                clamp: true,
            })
        );
    });

    test("translates ordinal position scales to u32 inputs and pixel ranges", () => {
        const data = [{ y: 0 }, { y: 2 }];
        const mark = createMark("point", data, {
            y: createEncoder((datum) => datum.y, {
                scale: {
                    type: "ordinal",
                    domain: () => [0, 1, 2],
                    range: () => [0, 0.5, 1],
                },
                channelDef: { field: "y", type: "nominal" },
            }),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );

        expect(/** @type {any} */ (translated).config.channels.y).toEqual(
            expect.objectContaining({
                data: new Uint32Array([0, 2]),
                type: "u32",
                scale: expect.objectContaining({
                    type: "ordinal",
                    domain: [0, 1, 2],
                    range: [220, 120, 20],
                }),
            })
        );
    });

    test.each(["time", "utc", "quantile", "bin-ordinal"])(
        "rejects unsupported %s scales",
        (scaleType) => {
            const mark = createMark("point", [{ x: 1 }], {
                x: createEncoder((datum) => datum.x, {
                    scale: {
                        type: scaleType,
                        domain: () => [0, 2],
                        range: () => [0, 1],
                    },
                    channelDef: { field: "x", type: "quantitative" },
                }),
            });

            expect(() =>
                createWebGpuMarkConfig(mark, {}, Rectangle.ZERO)
            ).toThrow(`Scale type "${scaleType}"`);
        }
    );

    test("rejects raw string categories without a Core domain indexer", () => {
        const mark = createMark("point", [{ category: "A" }], {
            x: createEncoder((datum) => datum.category, {
                scale: {
                    type: "band",
                    domain: () => ["A"],
                    paddingInner: () => 0,
                    paddingOuter: () => 0,
                    align: () => 0.5,
                },
                channelDef: { field: "category", type: "nominal" },
            }),
        });

        expect(() => createWebGpuMarkConfig(mark, {}, Rectangle.ZERO)).toThrow(
            "must contain u32 integers"
        );
    });

    test("translates ordinal color channels to renderer ids", () => {
        const data = [{ category: "A" }, { category: "B" }];
        const mark = createMark("point", data, {
            fill: createEncoder((datum) => datum.category, {
                scale: {
                    type: "ordinal",
                    domain: () => ["A", "B"],
                    range: () => ["red", "blue"],
                    props: {
                        domainIndexer: createCategoryIndexer(["A", "B"]),
                    },
                },
                channelDef: { field: "category", type: "nominal" },
            }),
        });

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

        expect(/** @type {any} */ (translated).config.channels.fill).toEqual(
            expect.objectContaining({
                data: new Uint32Array([0, 1]),
                type: "u32",
                inputComponents: 1,
                scale: expect.objectContaining({
                    type: "ordinal",
                    domain: [0, 1],
                    range: ["red", "blue"],
                }),
            })
        );
    });

    test("forwards unique ids for renderer picking", () => {
        const data = [{ id: 4 }, { id: 9 }];
        const mark = createMark("point", data, {
            uniqueId: createEncoder((datum) => datum.id, {
                channelDef: { field: "id", type: "quantitative" },
            }),
        });

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

        expect(
            /** @type {any} */ (translated).config.channels.uniqueId
        ).toEqual({
            data: new Uint32Array([4, 9]),
            type: "u32",
        });
    });

    test("translates point semantic zoom into generic visibility predicates", () => {
        const data = [
            { id: 4, score: 0.25 },
            { id: 9, score: 0.75 },
        ];
        const mark = createMark("point", data, {
            uniqueId: createEncoder((datum) => datum.id),
            semanticScore: createEncoder((datum) => datum.score, {
                channelDef: { field: "score", type: "quantitative" },
            }),
            fill: createConditionalEncoder([
                {
                    accessor: createAccessor(
                        () => "red",
                        { value: "red" },
                        true
                    ),
                    predicate: { param: "selected", empty: true },
                },
                {
                    accessor: createAccessor(
                        () => "black",
                        { value: "black" },
                        true
                    ),
                    predicate: { empty: false },
                },
            ]),
        });
        Object.assign(mark, {
            getSemanticThreshold: () => 0.5,
            unitView: {
                ...mark.unitView,
                paramRuntime: {
                    findValue: () => ({ type: "multi" }),
                },
            },
        });

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const config = /** @type {any} */ (translated).config;

        expect(config.inputs.semanticScoreInput).toEqual({
            data: new Float32Array([0.25, 0.75]),
            type: "f32",
        });
        expect(config.scalarSlots.semanticThreshold).toEqual({
            value: 0.5,
            type: "f32",
        });
        expect(config.visibleWhen).toEqual({
            any: [
                {
                    selection: "selected",
                    type: "multi",
                    empty: false,
                },
                {
                    compare: ">=",
                    left: { input: "semanticScoreInput" },
                    right: { slot: "semanticThreshold" },
                },
            ],
        });
    });

    test("omits semantic selection bypasses when unique ids are unavailable", () => {
        const mark = createMark("point", [{ score: 0.25 }], {
            semanticScore: createEncoder((datum) => datum.score),
        });
        Object.assign(mark, { getSemanticThreshold: () => 0.5 });

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        expect(/** @type {any} */ (translated).config.visibleWhen).toEqual({
            compare: ">=",
            left: { input: "semanticScoreInput" },
            right: { slot: "semanticThreshold" },
        });
    });

    test("translates every relevant selection into a semantic zoom bypass", () => {
        const mark = createMark("point", [{ id: 4, score: 0.25 }], {
            uniqueId: createEncoder((datum) => datum.id),
            semanticScore: createEncoder((datum) => datum.score),
            fill: createConditionalEncoder([
                {
                    accessor: createAccessor(
                        () => "red",
                        { value: "red" },
                        true
                    ),
                    predicate: { param: "first", empty: false },
                },
                {
                    accessor: createAccessor(
                        () => "blue",
                        { value: "blue" },
                        true
                    ),
                    predicate: { param: "second", empty: false },
                },
                {
                    accessor: createAccessor(
                        () => "black",
                        { value: "black" },
                        true
                    ),
                    predicate: { empty: false },
                },
            ]),
        });
        Object.assign(mark, {
            getSemanticThreshold: () => 0.5,
            unitView: {
                ...mark.unitView,
                paramRuntime: {
                    findValue: () => ({ type: "single", uniqueId: 4 }),
                },
            },
        });

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        expect(/** @type {any} */ (translated).config.visibleWhen.any).toEqual([
            { selection: "first", type: "single", empty: false },
            { selection: "second", type: "single", empty: false },
            {
                compare: ">=",
                left: { input: "semanticScoreInput" },
                right: { slot: "semanticThreshold" },
            },
        ]);
    });

    test("maps sequential and threshold color encodings", () => {
        const data = [{ value: -1 }, { value: 1 }];
        const interpolator = (/** @type {number} */ t) =>
            t < 0.5 ? "purple" : "yellow";
        const sequentialMark = createMark("point", data, {
            fill: createEncoder((datum) => datum.value, {
                scale: createSequentialScale([-1, 1], interpolator),
                channelDef: {
                    field: "value",
                    type: "quantitative",
                },
            }),
        });
        const thresholdMark = createMark("point", data, {
            fill: createEncoder((datum) => datum.value, {
                scale: createThresholdScale([0], ["white", "black"]),
                channelDef: {
                    field: "value",
                    type: "quantitative",
                },
            }),
        });

        const sequential = createWebGpuMarkConfig(
            sequentialMark,
            {},
            Rectangle.ZERO
        );
        const threshold = createWebGpuMarkConfig(
            thresholdMark,
            {},
            Rectangle.ZERO
        );

        expect(/** @type {any} */ (sequential).config.channels.fill).toEqual({
            data: new Float32Array([-1, 1]),
            type: "f32",
            inputComponents: 1,
            scale: {
                type: "linear",
                definition: linearScaleDefinition,
                domain: [-1, 1],
                range: interpolator,
                clamp: true,
            },
        });
        expect(/** @type {any} */ (threshold).config.channels.fill).toEqual({
            data: new Float32Array([-1, 1]),
            type: "f32",
            inputComponents: 1,
            scale: {
                type: "threshold",
                definition: thresholdScaleDefinition,
                domain: [0],
                range: [
                    [1, 1, 1, 1],
                    [0, 0, 0, 1],
                ],
            },
        });
    });

    test("preserves missing quantitative values but rejects infinities", () => {
        const data = [{ value: undefined }, { value: 1 }];
        const interpolator = (/** @type {number} */ t) =>
            t < 0.5 ? "purple" : "yellow";
        const mark = createMark("point", data, {
            y: createEncoder((datum) => datum.value, {
                scale: createLinearScale([0, 1]),
                channelDef: { field: "value", type: "quantitative" },
            }),
            fill: createEncoder((datum) => datum.value, {
                scale: createSequentialScale([0, 1], interpolator),
                channelDef: { field: "value", type: "quantitative" },
            }),
        });

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const channels = /** @type {any} */ (translated).config.channels;
        expect(channels.y.data).toEqual(new Float32Array([Number.NaN, 1]));
        expect(channels.fill.data).toEqual(new Float32Array([Number.NaN, 1]));

        for (const value of [
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            data[0].value = value;
            expect(() =>
                createWebGpuMarkConfig(
                    createMark("point", data, {
                        y: createEncoder((datum) => datum.value, {
                            scale: createLinearScale([0, 1]),
                            channelDef: {
                                field: "value",
                                type: "quantitative",
                            },
                        }),
                    }),
                    {},
                    Rectangle.ZERO
                )
            ).toThrow('Channel "y" contains an infinite value.');
        }
    });

    test("translates a categorical bar to the generic rect mark", () => {
        const data = [
            { category: "A", value: 28 },
            { category: "B", value: 55 },
        ];
        /** @param {number} band */
        const categorical = (band) => ({
            scale: createBandScale(["A", "B"]),
            channelDef: {
                field: "category",
                type: "nominal",
                band,
            },
        });
        const mark = createMark(
            "rect",
            data,
            {
                x: createEncoder((datum) => datum.category, categorical(0)),
                x2: createEncoder((datum) => datum.category, categorical(1)),
                y: createEncoder((datum) => datum.value, {
                    scale: createLinearScale([0, 100]),
                    channelDef: { field: "value", type: "quantitative" },
                }),
                y2: createConstantEncoder(0),
                xOffset: createConstantEncoder(0),
                x2Offset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                y2Offset: createConstantEncoder(0),
                fill: createConstantEncoder("#336699"),
                stroke: createConstantEncoder(null),
                fillOpacity: createConstantEncoder(1),
                strokeOpacity: createConstantEncoder(1),
                strokeWidth: createConstantEncoder(0),
            },
            {
                cornerRadius: 0,
                minWidth: 0.5,
                minHeight: 0.5,
                minOpacity: 1,
            }
        );

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const channels = /** @type {any} */ (translated).config.channels;

        expect(translated?.definition.type).toBe("rect");
        expect(channels.x.data).toEqual(new Uint32Array([0, 1]));
        expect(channels.x.scale.band).toBe(0);
        expect(channels.x2.scale.band).toBe(1);
        expect(channels.y.data).toEqual(new Float32Array([28, 55]));
        expect(channels.y2.value).toBe(220);
        expect(channels.fill.value).toEqual([0.2, 0.4, 0.6, 1]);
        expect(channels.hatchPattern).toEqual({ value: 0, type: "u32" });
    });

    test("keeps rectangle endpoint offsets as independently scaled channels", () => {
        const data = [
            { xOffset: -1, x2Offset: 0.5, yOffset: 0.25, y2Offset: 1 },
        ];
        const offsetScale = {
            type: "linear",
            domain: () => [0, 1],
            range: () => [0, 20],
            clamp: () => false,
        };
        const mark = createMark(
            "rect",
            data,
            {
                x: createConstantEncoder(0),
                x2: createConstantEncoder(1),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createEncoder((datum) => datum.xOffset, {
                    scale: offsetScale,
                }),
                x2Offset: createEncoder((datum) => datum.x2Offset, {
                    scale: offsetScale,
                }),
                yOffset: createEncoder((datum) => datum.yOffset, {
                    scale: offsetScale,
                }),
                y2Offset: createEncoder((datum) => datum.y2Offset, {
                    scale: offsetScale,
                }),
                fill: createConstantEncoder("black"),
                stroke: createConstantEncoder(null),
                fillOpacity: createConstantEncoder(1),
                strokeOpacity: createConstantEncoder(1),
                strokeWidth: createConstantEncoder(0),
            },
            { cornerRadius: 0, minWidth: 0, minHeight: 0, minOpacity: 0 }
        );

        const translated = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 20, 100, 200)
        );
        const channels = /** @type {any} */ (translated).config.channels;

        expect(channels.x.value).toBe(10);
        expect(channels.x2.value).toBe(110);
        expect(channels.xOffset.data).toEqual(new Float32Array([-1]));
        expect(channels.x2Offset.data).toEqual(new Float32Array([0.5]));
        expect(channels.xOffset.scale.range).toEqual([0, 20]);
        expect(channels.yOffset.scale.range).toEqual([0, 20]);
    });

    test("maps independent rectangle corner radii", () => {
        const mark = createMark(
            "rect",
            [{}],
            {
                x: createConstantEncoder(0),
                x2: createConstantEncoder(1),
                y: createConstantEncoder(0),
                y2: createConstantEncoder(1),
                xOffset: createConstantEncoder(0),
                x2Offset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                y2Offset: createConstantEncoder(0),
                fill: createConstantEncoder("black"),
                stroke: createConstantEncoder(null),
                fillOpacity: createConstantEncoder(1),
                strokeOpacity: createConstantEncoder(1),
                strokeWidth: createConstantEncoder(0),
            },
            {
                cornerRadius: 4,
                cornerRadiusTopRight: 1,
                cornerRadiusBottomRight: 2,
                cornerRadiusTopLeft: 3,
                cornerRadiusBottomLeft: 4,
                minWidth: 0,
                minHeight: 0,
                minOpacity: 0,
            }
        );
        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);
        const channels = /** @type {any} */ (translated).config.channels;

        expect(channels.cornerRadiusTopRight).toEqual({ value: 1 });
        expect(channels.cornerRadiusBottomRight).toEqual({ value: 2 });
        expect(channels.cornerRadiusTopLeft).toEqual({ value: 3 });
        expect(channels.cornerRadiusBottomLeft).toEqual({ value: 4 });
    });

    test.each([
        ["alphabetic", 0],
        ["baseline", 0],
        ["middle", 1],
        ["top", 2],
        ["bottom", 3],
    ])("maps the %s text baseline to renderer code %i", (baseline, code) => {
        const mark = createMark(
            "text",
            [{ label: "3.0" }],
            {
                x: createConstantEncoder(0),
                y: createConstantEncoder(0),
                text: createEncoder((datum) => datum.label),
                size: createConstantEncoder(12),
                angle: createConstantEncoder(0),
                xOffset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                color: createConstantEncoder("black"),
                opacity: createConstantEncoder(1),
            },
            {
                align: "left",
                baseline,
                font: "sans-serif",
                fontStyle: "normal",
                fontWeight: 400,
                paddingX: 0,
                paddingY: 0,
                flushX: false,
                flushY: false,
                squeeze: false,
            }
        );

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

        expect(
            /** @type {any} */ (translated).config.channels.baseline
        ).toEqual({ value: code, type: "u32" });
    });

    test("translates data-driven colors without a scale", () => {
        const mark = createMark("point", [{ color: "red" }], {
            fill: createEncoder((datum) => datum.color),
        });

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.ZERO
        );

        expect(/** @type {any} */ (translated).config.channels.fill).toEqual({
            data: new Float32Array([1, 0, 0, 1]),
            type: "f32",
            inputComponents: 4,
        });
    });

    test("reuses field-backed columns across scale-only updates", () => {
        const data = [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
        ];
        const x = vi.fn((datum) => datum.x);
        const y = vi.fn((datum) => datum.y);
        const mark = createMark("point", data, {
            x: createEncoder(x, {
                scale: createLinearScale([0, 4]),
                channelDef: { field: "x", type: "quantitative" },
            }),
            y: createEncoder(y, {
                scale: createLinearScale([0, 4]),
                channelDef: { field: "y", type: "quantitative" },
            }),
        });
        const first = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(0, 0, 100, 100)
        );
        const second = createWebGpuMarkConfig(
            mark,
            {},
            Rectangle.create(10, 0, 100, 100)
        );
        if (!first || !second) {
            throw new Error("Expected translated point marks.");
        }

        const firstChannels = /** @type {any} */ (first.config).channels;
        const secondChannels = /** @type {any} */ (second.config).channels;
        expect(secondChannels.x.data).toBe(firstChannels.x.data);
        expect(secondChannels.y.data).toBe(firstChannels.y.data);
        expect(secondChannels.x.scale.range).toEqual([10, 110]);
        expect(x).toHaveBeenCalledTimes(data.length);
        expect(y).toHaveBeenCalledTimes(data.length);
    });

    test("recomputes expression-backed columns for parameter changes", () => {
        const data = [{ x: 1 }];
        let offset = 0;
        const mark = createMark("point", data, {
            x: createEncoder((datum) => datum.x + offset, {
                scale: createLinearScale([0, 4]),
                channelDef: {
                    expr: "datum.x + offset",
                    type: "quantitative",
                },
            }),
        });
        const coords = Rectangle.create(0, 0, 100, 100);

        const first = createWebGpuMarkConfig(mark, {}, coords);
        offset = 2;
        const second = createWebGpuMarkConfig(mark, {}, coords);
        if (!first || !second) {
            throw new Error("Expected translated point marks.");
        }

        expect(/** @type {any} */ (first.config).channels.x.data).toEqual(
            new Float32Array([1])
        );
        expect(/** @type {any} */ (second.config).channels.x.data).toEqual(
            new Float32Array([3])
        );
    });

    test("translates a selection-driven color branch", () => {
        const data = [{ color: "red" }, { color: "blue" }];
        const mark = createMark("point", data, {
            fill: createConditionalEncoder([
                {
                    accessor: createAccessor(
                        /** @param {{color: string}} datum */
                        (datum) => datum.color,
                        { field: "color" }
                    ),
                    predicate: { param: "chosen", empty: false },
                },
                {
                    accessor: createAccessor(
                        () => "black",
                        { value: "black" },
                        true
                    ),
                    predicate: { empty: false },
                },
            ]),
        });
        /** @type {any} */ (mark.unitView).paramRuntime = {
            findValue: () => ({ type: "single", uniqueId: 1 }),
        };

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.create(0, 0, 100, 100)
        );
        const fill = /** @type {any} */ (translated).config.channels.fill;

        expect(fill.value).toEqual([0, 0, 0, 1]);
        expect(fill.conditions).toEqual([
            {
                when: {
                    selection: "chosen",
                    type: "single",
                    empty: false,
                },
                channel: {
                    data: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
                    type: "f32",
                    inputComponents: 4,
                },
            },
        ]);
    });

    test("translates an interval condition on a numeric channel", () => {
        const data = [{ x: 1 }, { x: 2 }];
        const mark = createMark("point", data, {
            x: createConditionalEncoder([
                {
                    accessor: createAccessor(
                        /** @param {{x: number}} datum */
                        (datum) => datum.x,
                        {
                            field: "x",
                        }
                    ),
                    predicate: { param: "brush", empty: true },
                },
                {
                    accessor: createAccessor(() => 0.5, { value: 0.5 }, true),
                    predicate: { empty: false },
                },
            ]),
        });
        /** @type {any} */ (mark.unitView).paramRuntime = {
            findValue: () => ({
                type: "interval",
                intervals: { x: [1, 2], y: [3, 4] },
            }),
        };

        const translated = createWebGpuMarkConfig(
            mark,
            /** @type {any} */ ({}),
            Rectangle.create(0, 0, 100, 100)
        );
        const x = /** @type {any} */ (translated).config.channels.x;

        expect(x.conditions[0].when).toEqual({
            selection: "brush",
            type: "interval",
            targets: [{ input: "x" }, { input: "y" }],
            empty: true,
        });
        expect(x.conditions[0].channel.data).toEqual(new Float32Array([1, 2]));
    });

    test.each(["x", "y"])("translates a %s-only interval target", (channel) => {
        const mark = createMark("point", [{ x: 1, y: 2 }], {
            [channel]: createConditionalEncoder([
                {
                    accessor: createAccessor(
                        /** @param {Record<string, number>} datum */
                        (datum) => datum[channel],
                        { field: channel }
                    ),
                    predicate: { param: "brush", empty: false },
                },
                {
                    accessor: createAccessor(() => 0.5, { value: 0.5 }, true),
                    predicate: { empty: false },
                },
            ]),
        });
        /** @type {any} */ (mark.unitView).paramRuntime = {
            findValue: () => ({
                type: "interval",
                intervals: { [channel]: [0, 3] },
            }),
        };

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

        expect(
            /** @type {any} */ (translated).config.channels[channel]
                .conditions[0].when.targets
        ).toEqual([{ input: channel }]);
    });

    test("carries secondary endpoint hit testing for ranged marks", () => {
        const mark = createMark(
            "rect",
            [{ x: 1, x2: 3, y: 1, y2: 3, color: "red" }],
            {
                x: createEncoder((datum) => datum.x),
                x2: createEncoder((datum) => datum.x2),
                y: createEncoder((datum) => datum.y),
                y2: createEncoder((datum) => datum.y2),
                xOffset: createConstantEncoder(0),
                x2Offset: createConstantEncoder(0),
                yOffset: createConstantEncoder(0),
                y2Offset: createConstantEncoder(0),
                fill: createConditionalEncoder([
                    {
                        accessor: createAccessor(
                            /** @param {{color: string}} datum */
                            (datum) => datum.color,
                            { field: "color" }
                        ),
                        predicate: { param: "brush", empty: true },
                    },
                    {
                        accessor: createAccessor(
                            () => "gray",
                            { value: "gray" },
                            true
                        ),
                        predicate: { empty: false },
                    },
                ]),
                stroke: createConstantEncoder(null),
                fillOpacity: createConstantEncoder(1),
                strokeOpacity: createConstantEncoder(1),
                strokeWidth: createConstantEncoder(0),
            },
            { cornerRadius: 0, minWidth: 0, minHeight: 0, minOpacity: 1 }
        );
        /** @type {any} */ (mark.unitView).paramRuntime = {
            findValue: () => ({
                type: "interval",
                intervals: { x: [1, 2] },
            }),
        };

        const translated = createWebGpuMarkConfig(mark, {}, Rectangle.ZERO);

        expect(
            /** @type {any} */ (translated).config.channels.fill.conditions[0]
                .when.targets
        ).toEqual([
            { input: "x", secondaryInput: "x2", hitTest: "intersects" },
        ]);
    });

    test("rejects a two-component interval target contextually", () => {
        const mark = createMark("point", [{ x: 1, color: "red" }], {
            x: createEncoder((datum) => datum.x, {
                scale: {
                    type: "index",
                    domain: () => [0, 2 ** 32 + 1],
                    paddingInner: () => 0,
                    paddingOuter: () => 0,
                    align: () => 0.5,
                },
            }),
            fill: createConditionalEncoder([
                {
                    accessor: createAccessor(
                        /** @param {{color: string}} datum */
                        (datum) => datum.color,
                        { field: "color" }
                    ),
                    predicate: { param: "brush", empty: true },
                },
                {
                    accessor: createAccessor(
                        () => "gray",
                        { value: "gray" },
                        true
                    ),
                    predicate: { empty: false },
                },
            ]),
        });
        /** @type {any} */ (mark.unitView).paramRuntime = {
            findValue: () => ({
                type: "interval",
                intervals: { x: [1, 2] },
            }),
        };

        expect(() => createWebGpuMarkConfig(mark, {}, Rectangle.ZERO)).toThrow(
            'cannot target two-component channel "x"'
        );
    });
});

/**
 * @param {string} type
 * @param {object[]} data
 * @param {Record<string, any>} encoders
 * @param {Record<string, any>} [properties]
 */
function createMark(type, data, encoders, properties = {}) {
    const defaultEncoders =
        type == "point"
            ? {
                  x: createConstantEncoder(0),
                  y: createConstantEncoder(0),
                  size: createConstantEncoder(64),
                  shape: createConstantEncoder("circle"),
                  strokeWidth: createConstantEncoder(0),
                  xOffset: createConstantEncoder(0),
                  yOffset: createConstantEncoder(0),
                  fill: createConstantEncoder("black"),
                  stroke: createConstantEncoder(null),
                  fillOpacity: createConstantEncoder(1),
                  strokeOpacity: createConstantEncoder(1),
                  angle: createConstantEncoder(0),
              }
            : {};
    return /** @type {import("../../marks/mark.js").default} */ (
        /** @type {unknown} */ ({
            encoders: { ...defaultEncoders, ...encoders },
            properties: {
                dx: 0,
                dy: 0,
                fillGradientStrength: 0,
                inwardStroke: false,
                ...properties,
            },
            getType: () => type,
            defaultHitTestMode: "intersects",
            unitView: {
                getCollector: () => ({
                    facetBatches: new Map([[undefined, data]]),
                }),
                getPathString: () => "root/plot",
            },
        })
    );
}

/**
 * @param {(datum: any) => any} accessor
 * @param {{scale?: any, channelDef?: any}} [options]
 */
function createEncoder(accessor, options = {}) {
    const channelDef = options.channelDef ?? {};
    Object.assign(accessor, { channelDef });
    return /** @type {import("../../types/encoder.js").Encoder} */ (
        /** @type {unknown} */ (
            Object.assign(vi.fn(accessor), {
                constant: false,
                scale: options.scale,
                branches: [{ accessor }],
                channelDef,
            })
        )
    );
}

/** @param {any} value */
function createConstantEncoder(value) {
    const accessor = () => value;
    return /** @type {import("../../types/encoder.js").Encoder} */ (
        /** @type {unknown} */ (
            Object.assign(vi.fn(accessor), {
                constant: true,
                branches: [{ accessor }],
                channelDef: { value },
            })
        )
    );
}

/**
 * @param {{accessor: Function, predicate: any}[]} branches
 */
function createConditionalEncoder(branches) {
    const fallbackAccessor = /** @type {any} */ (branches.at(-1).accessor);
    return /** @type {import("../../types/encoder.js").Encoder} */ (
        /** @type {unknown} */ (
            Object.assign(vi.fn(), {
                constant: false,
                branches,
                channelDef: fallbackAccessor.channelDef,
            })
        )
    );
}

/**
 * @param {Function} fn
 * @param {any} channelDef
 * @param {boolean} [constant]
 */
function createAccessor(fn, channelDef, constant = false) {
    return Object.assign(fn, { channelDef, constant });
}

/** @param {[number, number]} domain @param {boolean} [reverse] */
function createLinearScale(domain, reverse = false) {
    return {
        type: "linear",
        domain: () => domain,
        clamp: () => false,
        props: { reverse },
    };
}

/** @param {string[]} domain @param {boolean} [reverse] */
function createBandScale(domain, reverse = false) {
    return {
        type: "band",
        domain: () => domain,
        props: {
            reverse,
            domainIndexer: createCategoryIndexer(domain),
        },
        paddingInner: () => 0.2,
        paddingOuter: () => 0.1,
        align: () => 0.5,
    };
}

/** @param {string[]} domain */
function createCategoryIndexer(domain) {
    const ids = new Map(domain.map((value, index) => [value, index]));
    /** @param {string} value */
    return (value) => ids.get(value);
}

/** @param {[number, number]} domain */
function createIndexScale(domain) {
    return {
        type: "index",
        domain: () => domain,
        paddingInner: () => 0.2,
        paddingOuter: () => 0.1,
        align: () => 0.5,
    };
}

/**
 * @param {[number, number]} domain
 * @param {(t: number) => string} interpolator
 */
function createSequentialScale(domain, interpolator) {
    return {
        type: "sequential-linear",
        domain: () => domain,
        interpolator: () => interpolator,
        clamp: () => true,
    };
}

/**
 * @param {number[]} domain
 * @param {string[]} range
 */
function createThresholdScale(domain, range) {
    return {
        type: "threshold",
        domain: () => domain,
        range: () => range,
    };
}
