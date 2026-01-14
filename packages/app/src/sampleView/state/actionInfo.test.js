import { describe, expect, it } from "vitest";
import {
    faCheck,
    faCircle,
    faSortAmountDown,
} from "@fortawesome/free-solid-svg-icons";
import { getActionInfo } from "./actionInfo.js";
import { SAMPLE_SLICE_NAME } from "./sampleSlice.js";

describe("getActionInfo", () => {
    it("returns info for known sample actions", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/setSamples`,
            payload: { samples: [] },
        };

        const info = getActionInfo(action, () => undefined);

        expect(info.title).toBe("Set samples");
        expect(info.icon).toBe(faCheck);
    });

    it("maps attribute actions to provenance titles", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/sortBy`,
            payload: { attribute: "age" },
        };

        const info = getActionInfo(action, () => ({
            name: "age",
            title: "Age",
        }));

        expect(info.title).toBe("Sort by");
        expect(info.provenanceTitle).toBeDefined();
        expect(info.icon).toBe(faSortAmountDown);
    });

    it("returns undefined for non-sample actions", () => {
        const info = getActionInfo(
            { type: "other/action", payload: {} },
            () => undefined
        );

        expect(info).toBeUndefined();
    });

    it("falls back to a generic info entry for unknown actions", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/unknownAction`,
            payload: { value: 1 },
        };

        const info = getActionInfo(action, () => undefined);

        expect(info.icon).toBe(faCircle);
        expect(info.title).toContain("unknownAction");
    });
});
