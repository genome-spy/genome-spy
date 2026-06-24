import { describe, expect, test } from "vitest";

import {
    captureMutationAcidIdentities,
    createMutationAcidSnapshot,
    createViewMutationAcidHarness,
} from "./viewMutationAcidTestUtils.js";

/**
 * @param {string} name
 * @param {string} title
 * @returns {import("../spec/view.js").UnitSpec}
 */
function makeTrackSpec(name, title) {
    return {
        name,
        title,
        data: {
            values: [
                { pos: 1, value: 2, group: "a" },
                { pos: 2, value: 4, group: "b" },
            ],
        },
        mark: "point",
        encoding: {
            x: { field: "pos", type: "quantitative" },
            y: { field: "value", type: "quantitative" },
            color: { field: "group", type: "nominal" },
        },
    };
}

/**
 * @returns {import("../spec/view.js").VConcatSpec}
 */
function makeAcidSpec() {
    return {
        name: "tracks",
        vconcat: [
            makeTrackSpec("trackA", "Track A"),
            makeTrackSpec("trackB", "Track B"),
        ],
        resolve: {
            scale: {
                x: "shared",
            },
        },
        config: {
            view: {
                stroke: "lightgray",
            },
        },
    };
}

describe("View mutation acid scenarios", () => {
    test("restores the internal hierarchy after an immediately canceled mutation sequence", async () => {
        const { view, api } =
            await createViewMutationAcidHarness(makeAcidSpec());
        const baselineIdentity = captureMutationAcidIdentities(view);
        const baselineSnapshot = createMutationAcidSnapshot(view);

        await api.transaction(async (views) => {
            const trackA = views.get({ scope: [], view: "trackA" });
            const summary = await views.insert(
                "root",
                makeTrackSpec("summary", "Summary"),
                { index: 1, scope: "summaryScope" }
            );

            await views.move(trackA, { index: 2 });
            await views.move(trackA, { index: 0 });
            await views.remove(summary);
        });

        expect(createMutationAcidSnapshot(view)).toEqual(baselineSnapshot);

        const restoredIdentity = captureMutationAcidIdentities(view);
        expect(restoredIdentity.views).toHaveLength(
            baselineIdentity.views.length
        );
        for (const [index, restoredView] of restoredIdentity.views.entries()) {
            expect(restoredView).toBe(baselineIdentity.views[index]);
            expect(restoredIdentity.collectors[index]).toBe(
                baselineIdentity.collectors[index]
            );
        }
    });
});
