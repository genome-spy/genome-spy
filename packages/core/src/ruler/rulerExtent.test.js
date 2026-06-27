import { describe, expect, test } from "vitest";
import { resolveRulerExtent } from "./rulerExtent.js";

function createParticipant(channel, scaleResolution = {}) {
    return {
        view: {},
        channel,
        scaleResolution,
    };
}

describe("resolveRulerExtent", () => {
    test("keeps explicit view extent per-view", () => {
        const extent = resolveRulerExtent({
            paramName: "cursor",
            requestedExtent: "view",
            owner: { spec: { vconcat: [] } },
            channels: ["x"],
            participants: [createParticipant("x")],
        });

        expect(extent).toEqual({ type: "view" });
    });

    test("uses container extent for aligned x rulers in vconcat", () => {
        const resolution = {};
        const extent = resolveRulerExtent({
            paramName: "cursor",
            requestedExtent: "auto",
            owner: { spec: { vconcat: [] } },
            channels: ["x"],
            participants: [
                createParticipant("x", resolution),
                createParticipant("x", resolution),
            ],
        });

        expect(extent).toEqual({ type: "container", channel: "x" });
    });

    test("uses container extent for aligned y rulers in hconcat", () => {
        const resolution = {};
        const extent = resolveRulerExtent({
            paramName: "cursor",
            requestedExtent: "auto",
            owner: { spec: { hconcat: [] } },
            channels: ["y"],
            participants: [
                createParticipant("y", resolution),
                createParticipant("y", resolution),
            ],
        });

        expect(extent).toEqual({ type: "container", channel: "y" });
    });

    test("falls back to view extent for auto when projections differ", () => {
        const extent = resolveRulerExtent({
            paramName: "cursor",
            requestedExtent: "auto",
            owner: { spec: { vconcat: [] } },
            channels: ["x"],
            participants: [createParticipant("x"), createParticipant("x")],
        });

        expect(extent).toEqual({ type: "view" });
    });

    test("rejects forced container extent when projections differ", () => {
        expect(() =>
            resolveRulerExtent({
                paramName: "cursor",
                requestedExtent: "container",
                owner: { spec: { vconcat: [] } },
                channels: ["x"],
                participants: [createParticipant("x"), createParticipant("x")],
            })
        ).toThrow(
            'Ruler param "cursor" cannot use extent "container" because its x projections do not align.'
        );
    });

    test("rejects forced container extent for unsupported concat direction", () => {
        expect(() =>
            resolveRulerExtent({
                paramName: "cursor",
                requestedExtent: "container",
                owner: { spec: { hconcat: [] } },
                channels: ["x"],
                participants: [createParticipant("x")],
            })
        ).toThrow(
            'Ruler param "cursor" cannot use extent "container" for channel "x" in this view.'
        );
    });
});
