import { describe, expect, test, vi } from "vitest";
import Rectangle from "../../view/layout/rectangle.js";
import { prepareRangeProjection } from "./markEncoding.js";

/**
 * @param {(datum: import("../../data/flowNode.js").Datum) => import("../../spec/channel.js").Scalar} value
 * @param {{constant?: boolean, scale?: object, band?: number}} [options]
 * @returns {import("../../types/encoder.js").Encoder}
 */
function createEncoder(value, options = {}) {
    return /** @type {import("../../types/encoder.js").Encoder} */ (
        /** @type {unknown} */ (
            Object.assign(vi.fn(value), {
                constant: options.constant ?? false,
                scale: options.scale,
                branches: [],
                channelDef:
                    options.band === undefined
                        ? { value: 0 }
                        : { value: 0, band: options.band },
            })
        )
    );
}

describe("prepareRangeProjection", () => {
    test("hoists constant positions and offsets but evaluates data-dependent encoders", () => {
        let primaryValue = 0.25;
        const x = createEncoder(() => primaryValue, {
            constant: true,
            scale: { type: "linear" },
        });
        const x2 = createEncoder((datum) => datum.x2);
        const xOffset = createEncoder(() => 2, { constant: true });
        const x2Offset = createEncoder((datum) => datum.offset);
        const encoders = { x, x2, xOffset, x2Offset };
        const coords = Rectangle.create(10, 20, 100, 200);
        const project = prepareRangeProjection(coords, encoders, "x", {});

        expect(project({ x2: 0.5, offset: 3 }, [0, 0])).toEqual([37, 63]);
        expect(project({ x2: 0.75, offset: 4 }, [0, 0])).toEqual([37, 89]);
        expect(x).toHaveBeenCalledOnce();
        expect(xOffset).toHaveBeenCalledOnce();
        expect(x2).toHaveBeenCalledTimes(2);
        expect(x2Offset).toHaveBeenCalledTimes(2);

        primaryValue = 0.5;
        const nextProject = prepareRangeProjection(coords, encoders, "x", {});
        expect(nextProject({ x2: 0.5, offset: 3 }, [0, 0])[0]).toBe(62);
        expect(x).toHaveBeenCalledTimes(2);
    });

    test("inherits a data-dependent primary offset for the secondary position", () => {
        const x = createEncoder((datum) => datum.x);
        const x2 = createEncoder((datum) => datum.x2);
        const xOffset = createEncoder((datum) => datum.offset);
        const project = prepareRangeProjection(
            Rectangle.create(10, 20, 100, 200),
            { x, x2, xOffset },
            "x",
            {}
        );

        expect(project({ x: 0.25, x2: 0.75, offset: 4 }, [0, 0])).toEqual([
            39, 89,
        ]);
        expect(xOffset).toHaveBeenCalledOnce();
    });

    test("projects y positions and reversed coordinate spans", () => {
        const x = createEncoder(() => 0.25, { constant: true });
        const y = createEncoder(() => 0.25, { constant: true });
        const xOffset = createEncoder(() => 0, { constant: true });
        const yOffset = createEncoder(() => 0, { constant: true });
        const x2Offset = createEncoder(() => 5, { constant: true });
        const coords = Rectangle.create(110, 220, -100, -200);

        const projectX = prepareRangeProjection(
            coords,
            { x, xOffset, x2Offset },
            "x",
            {}
        );
        const projectY = prepareRangeProjection(
            coords,
            { y, yOffset },
            "y",
            {}
        );

        expect(projectX({}, [0, 0])).toEqual([85, 85]);
        expect(projectY({}, [0, 0])).toEqual([70, 70]);
        expect(x2Offset).not.toHaveBeenCalled();
    });

    test.each([
        ["band", 0.25, 0.2, 1, 0.5, 0.05],
        ["point", undefined, 0.1, 1, 0.5, 0.05],
        ["index", 1, 0.08, -0.1, 0.5, -0.04],
        ["locus", 0, 0.08, 0.1, 0.25, -0.02],
    ])(
        "prepares %s scale band placement once",
        (type, band, bandwidth, step, align, adjustment) => {
            const scale = {
                type,
                bandwidth: vi.fn(() => bandwidth),
                step: vi.fn(() => step),
                align: vi.fn(() => align),
            };
            const x = createEncoder(() => 0.2, {
                constant: true,
                scale,
                band,
            });
            const xOffset = createEncoder(() => 0, { constant: true });
            const project = prepareRangeProjection(
                Rectangle.create(0, 0, 100, 100),
                { x, xOffset },
                "x",
                {}
            );

            expect(project({}, [0, 0])[0]).toBeCloseTo(
                (0.2 + adjustment) * 100
            );
            project({}, [0, 0]);
            expect(scale.bandwidth).toHaveBeenCalledOnce();
            if (type == "index" || type == "locus") {
                expect(scale.step).toHaveBeenCalledOnce();
                expect(scale.align).toHaveBeenCalledOnce();
            }
        }
    );
});
