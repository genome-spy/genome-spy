import { describe, expect, test } from "vitest";
import Collector from "../collector.js";
import { processData } from "../flowTestUtils.js";
import SetIntersectionTransform from "./setIntersection.js";
import createTransform from "./transformFactory.js";

/**
 * @param {import("../../spec/transform.js").SetIntersectionParams} params
 * @param {any[]} data
 */
function transform(params, data) {
    return processData(new SetIntersectionTransform(params), data);
}

describe("SetIntersection transform", () => {
    test("computes sparse exact-membership profiles in stable input order", () => {
        const input = [
            { element: "A", set: "School" },
            { element: "B", set: "School" },
            { element: "A", set: "Blue Hair" },
            { element: "A", set: "School" },
            { element: "C", set: "Evil" },
        ];

        expect(
            transform(
                { type: "setIntersection", element: "element", set: "set" },
                input
            )
        ).toEqual([
            {
                profileKey: "110",
                profileSize: 1,
                profileDegree: 2,
                set: "School",
                setIndex: 0,
                member: true,
            },
            {
                profileKey: "110",
                profileSize: 1,
                profileDegree: 2,
                set: "Blue Hair",
                setIndex: 1,
                member: true,
            },
            {
                profileKey: "110",
                profileSize: 1,
                profileDegree: 2,
                set: "Evil",
                setIndex: 2,
                member: false,
            },
            {
                profileKey: "100",
                profileSize: 1,
                profileDegree: 1,
                set: "School",
                setIndex: 0,
                member: true,
            },
            {
                profileKey: "100",
                profileSize: 1,
                profileDegree: 1,
                set: "Blue Hair",
                setIndex: 1,
                member: false,
            },
            {
                profileKey: "100",
                profileSize: 1,
                profileDegree: 1,
                set: "Evil",
                setIndex: 2,
                member: false,
            },
            {
                profileKey: "001",
                profileSize: 1,
                profileDegree: 1,
                set: "School",
                setIndex: 0,
                member: false,
            },
            {
                profileKey: "001",
                profileSize: 1,
                profileDegree: 1,
                set: "Blue Hair",
                setIndex: 1,
                member: false,
            },
            {
                profileKey: "001",
                profileSize: 1,
                profileDegree: 1,
                set: "Evil",
                setIndex: 2,
                member: true,
            },
        ]);
    });

    test("supports dense membership and emits the degree-zero profile", () => {
        const input = [
            { element: 1, set: "A", included: 1 },
            { element: 1, set: "B", included: 0 },
            { element: 1, set: "C", included: false },
            { element: 2, set: "A", included: true },
            { element: 2, set: "B", included: false },
            { element: 2, set: "C", included: 0 },
            { element: 3, set: "A", included: false },
            { element: 3, set: "B", included: 0 },
            { element: 3, set: "C", included: false },
        ];

        expect(
            transform(
                {
                    type: "setIntersection",
                    element: "element",
                    set: "set",
                    membership: "included",
                },
                input
            )
        ).toEqual([
            {
                profileKey: "100",
                profileSize: 2,
                profileDegree: 1,
                set: "A",
                setIndex: 0,
                member: true,
            },
            {
                profileKey: "100",
                profileSize: 2,
                profileDegree: 1,
                set: "B",
                setIndex: 1,
                member: false,
            },
            {
                profileKey: "100",
                profileSize: 2,
                profileDegree: 1,
                set: "C",
                setIndex: 2,
                member: false,
            },
            {
                profileKey: "000",
                profileSize: 1,
                profileDegree: 0,
                set: "A",
                setIndex: 0,
                member: false,
            },
            {
                profileKey: "000",
                profileSize: 1,
                profileDegree: 0,
                set: "B",
                setIndex: 1,
                member: false,
            },
            {
                profileKey: "000",
                profileSize: 1,
                profileDegree: 0,
                set: "C",
                setIndex: 2,
                member: false,
            },
        ]);
    });

    test("uses collision-free compound element identifiers", () => {
        const input = [
            { first: "x|y", second: "z", set: "A" },
            { first: "x", second: "y|z", set: "B" },
        ];

        expect(
            transform(
                {
                    type: "setIntersection",
                    element: ["first", "second"],
                    set: "set",
                },
                input
            ).map(({ profileKey, profileSize }) => ({
                profileKey,
                profileSize,
            }))
        ).toEqual([
            { profileKey: "10", profileSize: 1 },
            { profileKey: "10", profileSize: 1 },
            { profileKey: "01", profileSize: 1 },
            { profileKey: "01", profileSize: 1 },
        ]);
    });

    test("rejects conflicting duplicate memberships", () => {
        expect(() =>
            transform(
                {
                    type: "setIntersection",
                    element: "element",
                    set: "set",
                    membership: "included",
                },
                [
                    { element: "A", set: "S", included: true },
                    { element: "A", set: "S", included: false },
                ]
            )
        ).toThrow(/Conflicting membership/);
    });

    test.each([null, undefined, 2, "1", Number.NaN, Infinity])(
        "rejects invalid membership value %s",
        (included) => {
            expect(() =>
                transform(
                    {
                        type: "setIntersection",
                        element: "element",
                        set: "set",
                        membership: "included",
                    },
                    [{ element: "A", set: "S", included }]
                )
            ).toThrow(/membership field/);
        }
    );

    test.each([
        [null, "S"],
        [{}, "S"],
        [Number.NaN, "S"],
        ["A", null],
        ["A", {}],
        ["A", Infinity],
    ])("rejects invalid element or set values", (element, set) => {
        expect(() =>
            transform(
                { type: "setIntersection", element: "element", set: "set" },
                [{ element, set }]
            )
        ).toThrow(/field must contain finite scalar values/);
    });

    test("flushes each facet batch before the next one starts", () => {
        const setIntersection = new SetIntersectionTransform({
            type: "setIntersection",
            element: "element",
            set: "set",
        });
        const collector = new Collector();
        setIntersection.addChild(collector);

        // A batch boundary must prevent memberships from separate facets mixing.
        setIntersection.beginBatch({ type: "facet", facetId: ["A"] });
        setIntersection.handle({ element: "x", set: "first" });
        setIntersection.beginBatch({ type: "facet", facetId: ["B"] });
        setIntersection.handle({ element: "x", set: "second" });
        setIntersection.complete();

        expect(collector.facetBatches.get(["A"])).toEqual([
            {
                profileKey: "1",
                profileSize: 1,
                profileDegree: 1,
                set: "first",
                setIndex: 0,
                member: true,
            },
        ]);
        expect(collector.facetBatches.get(["B"])).toEqual([
            {
                profileKey: "1",
                profileSize: 1,
                profileDegree: 1,
                set: "second",
                setIndex: 0,
                member: true,
            },
        ]);
    });

    test("reset discards buffered memberships", () => {
        const setIntersection = new SetIntersectionTransform({
            type: "setIntersection",
            element: "element",
            set: "set",
        });
        const collector = new Collector();
        setIntersection.addChild(collector);

        setIntersection.handle({ element: "old", set: "old" });
        setIntersection.reset();
        setIntersection.handle({ element: "new", set: "new" });
        setIntersection.complete();

        expect(Array.from(collector.getData())).toEqual([
            {
                profileKey: "1",
                profileSize: 1,
                profileDegree: 1,
                set: "new",
                setIndex: 0,
                member: true,
            },
        ]);
    });

    test("is available through the transform factory", () => {
        const params =
            /** @type {import("../../spec/transform.js").SetIntersectionParams} */ ({
                type: "setIntersection",
                element: "element",
                set: "set",
            });

        expect(createTransform(params)).toBeInstanceOf(
            SetIntersectionTransform
        );
    });
});
