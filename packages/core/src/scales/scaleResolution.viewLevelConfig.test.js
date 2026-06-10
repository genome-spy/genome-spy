// @ts-nocheck

import { describe, expect, test } from "vitest";

import LayerView from "../view/layerView.js";
import {
    getRequiredScaleResolution,
    initView,
} from "./scaleResolutionTestUtils.js";

describe("ScaleResolution view-level config attachment", () => {
    test("stores and clears view-level scale config", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");
        const config = { domain: [0, 10] };

        resolution.attachViewLevelScaleConfig(view, config);

        expect(resolution.getViewLevelScaleConfig()).toEqual({
            view,
            config,
        });

        resolution.clearViewLevelScaleConfig(view);

        expect(resolution.getViewLevelScaleConfig()).toBeUndefined();
    });

    test("allows the same view to replace its view-level scale config", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");
        const firstConfig = { domain: [0, 10] };
        const secondConfig = { domain: [2, 8] };

        resolution.attachViewLevelScaleConfig(view, firstConfig);
        resolution.attachViewLevelScaleConfig(view, secondConfig);

        expect(resolution.getViewLevelScaleConfig()).toEqual({
            view,
            config: secondConfig,
        });
    });

    test("rejects duplicate view-level configs for the same resolution", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");

        resolution.attachViewLevelScaleConfig(view, { domain: [0, 10] });

        expect(() =>
            resolution.attachViewLevelScaleConfig(view.children[0], {
                domain: [2, 8],
            })
        ).toThrow(
            "Multiple view-level scale configs target the same x scale resolution."
        );
    });

    test("rejects member scale config when attaching view-level config", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ value: 1 }] },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        x: {
                            field: "value",
                            type: "quantitative",
                            scale: { nice: false },
                        },
                    },
                },
            ],
        };

        const view = await initView(spec, LayerView);
        const resolution = getRequiredScaleResolution(view, "x");

        expect(() =>
            resolution.attachViewLevelScaleConfig(view, { domain: [0, 10] })
        ).toThrow(
            "Cannot mix view-level scales.x with encoding.x.scale in the same scale resolution."
        );
    });

    test("rejects secondary member scale config in the same resolution", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: { values: [{ start: 1, end: 2 }] },
            layer: [
                {
                    mark: "rect",
                    encoding: {
                        x: {
                            field: "start",
                            type: "quantitative",
                        },
                        x2: {
                            field: "end",
                            scale: { nice: false },
                        },
                    },
                },
            ],
        };

        const view = await initView(spec, LayerView);
        const resolution = getRequiredScaleResolution(view, "x");

        expect(() =>
            resolution.attachViewLevelScaleConfig(view, { domain: [0, 10] })
        ).toThrow(
            "Cannot mix view-level scales.x with encoding.x2.scale in the same scale resolution."
        );
    });

    test("uses view-level scale properties when resolving scale props", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");

        resolution.attachViewLevelScaleConfig(view, {
            type: "log",
            base: 2,
        });

        expect(resolution.getScale().type).toBe("log");
        expect(resolution.getScale().base()).toBe(2);
    });

    test("infers scale type from member data type when view-level type is omitted", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");

        resolution.attachViewLevelScaleConfig(view, { domain: [0, 10] });

        expect(resolution.getScale().type).toBe("linear");
    });

    test("rejects view-level scale type incompatible with inferred data type", async () => {
        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            data: {
                values: [{ chrom: "chr1", pos: 1 }],
            },
            layer: [
                {
                    mark: "point",
                    encoding: {
                        x: {
                            chrom: "chrom",
                            pos: "pos",
                            type: "locus",
                        },
                    },
                },
            ],
        };

        const view = await initView(spec, LayerView);
        const resolution = getRequiredScaleResolution(view, "x");

        expect(() =>
            resolution.attachViewLevelScaleConfig(view, { type: "linear" })
        ).toThrow(
            'View-level scales.x.type "linear" is incompatible with "locus" data.'
        );
    });

    test("uses view-level domain as an explicit domain", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");

        resolution.attachViewLevelScaleConfig(view, { domain: [0, 10] });

        expect(resolution.getScale().domain()).toEqual([0, 10]);
        expect(resolution.isDomainDefinedExplicitly()).toBe(true);
    });

    test("combines view-level domainMin with extracted data domain", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");

        resolution.attachViewLevelScaleConfig(view, { domainMin: 0 });
        resolution.reconfigure();

        expect(resolution.getScale().domain()).toEqual([0, 1]);
        expect(resolution.isDomainDefinedExplicitly()).toBe(false);
    });

    test("combines view-level domainMax with extracted data domain", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");

        resolution.attachViewLevelScaleConfig(view, {
            domainMax: 10,
            zero: false,
        });
        resolution.reconfigure();

        expect(resolution.getScale().domain()).toEqual([1, 10]);
        expect(resolution.isDomainDefinedExplicitly()).toBe(false);
    });

    test("combines view-level domainMid with extracted data domain", async () => {
        const view = await createSharedLayer();
        const resolution = getRequiredScaleResolution(view, "x");

        resolution.attachViewLevelScaleConfig(view, { domainMid: 0.5 });
        resolution.reconfigure();

        expect(resolution.getScale().domain()).toEqual([0, 0.5, 1]);
        expect(resolution.getScale().props.domainMid).toBe(0.5);
        expect(resolution.isDomainDefinedExplicitly()).toBe(false);
    });
});

async function createSharedLayer() {
    /** @type {import("../spec/view.js").LayerSpec} */
    const spec = {
        data: { values: [{ value: 1 }] },
        layer: [
            {
                mark: "point",
                encoding: {
                    x: { field: "value", type: "quantitative" },
                },
            },
            {
                mark: "point",
                encoding: {
                    x: { field: "value", type: "quantitative" },
                },
            },
        ],
    };

    return initView(spec, LayerView);
}
