// @ts-check
import { describe, expect, it } from "vitest";
import {
    createSelectionExpansionPredicateFunction,
    normalizeSelectionExpansionMatcher,
    normalizeSelectionExpansionPredicate,
    toSelectionExpansionPredicate,
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

    it("converts sameFieldValue rules into valueFromField predicates", () => {
        /** @type {import("./selectionExpansion.js").SelectionExpansionMatcher} */
        const matcher = {
            kind: "sameFieldValue",
            field: "clusterId",
        };

        expect(toSelectionExpansionPredicate(matcher)).toEqual({
            field: "clusterId",
            op: "eq",
            valueFromField: "clusterId",
        });
    });

    it("normalizes rules using the origin datum", () => {
        const origin = { clusterId: "C1", patientId: "P1" };
        /** @type {import("./selectionExpansion.js").SelectionExpansionMatcher} */
        const matcher = {
            kind: "sameFieldValue",
            field: "clusterId",
        };

        const normalized = normalizeSelectionExpansionMatcher(matcher, origin);

        expect(normalized).toEqual({
            field: "clusterId",
            op: "eq",
            value: "C1",
        });
    });

    it("supports dotted literal field names in flat datums", () => {
        const origin = {
            "Gene.refGene": "GRM8",
        };
        /** @type {import("./selectionExpansion.js").SelectionExpansionMatcher} */
        const matcher = {
            kind: "sameFieldValue",
            field: "Gene.refGene",
        };

        const normalized = normalizeSelectionExpansionMatcher(matcher, origin);
        expect(normalized).toEqual({
            field: "Gene.refGene",
            op: "eq",
            value: "GRM8",
        });

        const test = createSelectionExpansionPredicateFunction(normalized);
        expect(test({ "Gene.refGene": "GRM8" })).toBe(true);
        expect(test({ "Gene.refGene": "TP53" })).toBe(false);
    });
});
