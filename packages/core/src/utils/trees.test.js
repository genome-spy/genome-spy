import { expect, test } from "vitest";
import { nodesToTrees, visitTree } from "./trees.js";
import { describe } from "vitest";

describe("NodesToTrees", () => {
    const NULL = /** @type {any} */ (null);

    test("NodesToTrees converts an array of nodes to a tree", () => {
        const a = { parent: NULL };
        const b = { parent: a };
        const c = { parent: a };
        const d = { parent: b };
        const e = { parent: b };

        const nodes = [a, b, c, d, e];

        const trees = nodesToTrees(nodes);

        expect(trees).toEqual([
            {
                ref: a,
                children: [
                    {
                        ref: b,
                        children: [
                            {
                                ref: d,
                                children: [],
                            },
                            {
                                ref: e,
                                children: [],
                            },
                        ],
                    },
                    {
                        ref: c,
                        children: [],
                    },
                ],
            },
        ]);
    });

    test("NodesToTrees converts two disjoint node arrays to two trees", () => {
        const a = { parent: NULL };
        const b = { parent: a };

        const c = { parent: NULL };
        const d = { parent: c };

        const nodes = [a, b, c, d];

        const trees = nodesToTrees(nodes);

        expect(trees).toEqual([
            {
                ref: a,
                children: [
                    {
                        ref: b,
                        children: [],
                    },
                ],
            },
            {
                ref: c,
                children: [
                    {
                        ref: d,
                        children: [],
                    },
                ],
            },
        ]);
    });
});

describe("VisitTree", () => {
    test("VisitTree visits all nodes in a tree in correct order", () => {
        const tree = {
            id: "a",
            children: [
                {
                    id: "b",
                    children: [
                        {
                            id: "d",
                            /** @type {any[]} */
                            children: [],
                        },
                        {
                            id: "e",
                            children: [],
                        },
                    ],
                },
                {
                    id: "c",
                    children: [],
                },
            ],
        };

        /** @type {any[]} */
        const visitedPre = [];
        /** @type {any[]} */
        const visitedPost = [];

        visitTree(tree, {
            preOrder: (node) => {
                visitedPre.push(node);
            },
            postOrder: (node) => {
                visitedPost.push(node);
            },
        });

        expect(visitedPre.map((node) => node.id)).toEqual([
            "a",
            "b",
            "d",
            "e",
            "c",
        ]);

        expect(visitedPost.map((node) => node.id)).toEqual([
            "d",
            "e",
            "b",
            "c",
            "a",
        ]);
    });
});
