// @ts-check
import { describe, expect, it } from "vitest";
import {
    createSelectionExpansionPredicateFunction,
    normalizeSelectionExpansionPredicate,
    withPartitionBy,
} from "./selectionExpansion.js";

describe("selectionExpansion", () => {
    it("normalizes valueFromField predicates using the origin datum", () => {
        const origin = { clusterId: "C1", patientId: "P1" };
        /** @type {import("./selectionExpansion.js").SelectionExpansionPredicate} */
        const predicate = {
            field: "clusterId",
            op: "eq",
            valueFromField: "clusterId",
        };

        const normalized = normalizeSelectionExpansionPredicate(
            predicate,
            origin
        );

        expect(normalized).toEqual({
            field: "clusterId",
            op: "eq",
            value: "C1",
        });
    });

    it("evaluates normalized logical predicates", () => {
        const origin = { clusterId: "C1", patientId: "P1" };
        /** @type {import("./selectionExpansion.js").SelectionExpansionPredicate} */
        const predicate = {
            field: "clusterId",
            op: "eq",
            valueFromField: "clusterId",
        };
        const base = normalizeSelectionExpansionPredicate(predicate, origin);
        const scoped = withPartitionBy(base, ["patientId"], origin);
        const test = createSelectionExpansionPredicateFunction(scoped);

        expect(test({ clusterId: "C1", patientId: "P1" })).toBe(true);
        expect(test({ clusterId: "C1", patientId: "P2" })).toBe(false);
        expect(test({ clusterId: "C2", patientId: "P1" })).toBe(false);
    });
});
