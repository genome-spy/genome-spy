import { describe, expect, it } from "vitest";
import { html } from "lit";
import {
    faCheck,
    faCircle,
    faSortAmountDown,
} from "@fortawesome/free-solid-svg-icons";
import { getActionInfo } from "./actionInfo.js";
import { SAMPLE_SLICE_NAME } from "./sampleSlice.js";
import templateResultToString from "../../utils/templateResultToString.js";

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

    it("keeps selection-source wording in sort provenance titles", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/sortBy`,
            payload: {
                attribute: {
                    type: "VALUE_AT_LOCUS",
                    specifier: {
                        view: "track",
                        field: "value",
                        aggregation: { op: "count" },
                        interval: {
                            type: "selection",
                            selector: { scope: [], param: "brush" },
                        },
                    },
                },
            },
        };

        const info = getActionInfo(action, () => ({
            name: "count(value)",
            title: html`count(value) in selection <strong>brush</strong>`,
        }));

        const provenanceTitle = templateResultToString(info.provenanceTitle);
        expect(provenanceTitle).toContain("selection brush");
        expect(provenanceTitle).not.toContain("chr");
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
