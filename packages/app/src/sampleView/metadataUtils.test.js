import { describe, it, expect } from "vitest";
import {
    buildPathTree,
    computeAttributeDefs,
    combineSampleMetadata,
} from "./metadataUtils.js";

describe("buildPathTree", () => {
    it("builds a hierarchy including three levels from dotted path names", () => {
        const paths = [
            "foo.bar",
            "foo.bar.baz",
            "foo.bar.qux",
            "foo.baz",
            "blaa.qwe",
            "blaa.asd",
            "single",
        ];

        const root = buildPathTree(paths, ".");

        // Top-level buckets
        expect(root.children.has("foo")).toBe(true);
        expect(root.children.has("blaa")).toBe(true);
        expect(root.children.has("single")).toBe(true);

        const foo = root.children.get("foo");
        expect(foo).toBeDefined();
        expect(foo.path).toBe("foo");
        // foo should have children: bar and baz
        expect(foo.children.has("bar")).toBe(true);
        expect(foo.children.has("baz")).toBe(true);

        const bar = foo.children.get("bar");
        expect(bar).toBeDefined();
        // full attribute path is preserved for intermediate node
        expect(bar.path).toBe("foo.bar");
        // bar should have its own children (baz, qux)
        expect(bar.children.has("baz")).toBe(true);
        expect(bar.children.has("qux")).toBe(true);

        const baz = bar.children.get("baz");
        expect(baz).toBeDefined();
        expect(baz.path).toBe("foo.bar.baz");
        expect(baz.children.size).toBe(0);

        // parent pointers
        expect(foo.parent).toBe(root);
        expect(bar.parent).toBe(foo);
        expect(baz.parent).toBe(bar);

        const single = root.children.get("single");
        expect(single).toBeDefined();
        expect(single.path).toBe("single");
        expect(single.children.size).toBe(0);
    });

    it("treats null/undefined separator as no-split", () => {
        const paths = ["a.b", "c"];
        const root = buildPathTree(paths, null);

        // With null separator the strings are not split, so keys are the full strings
        expect(root.children.has("a.b")).toBe(true);
        expect(root.children.has("c")).toBe(true);
        const ab = root.children.get("a.b");
        expect(ab.path).toBe("a.b");
        expect(ab.children.size).toBe(0);
    });
});

describe("computeAttributeDefs", () => {
    it("infers quantitative for numeric fields and nominal for strings", () => {
        const sampleMetadata = {
            attributeNames: ["score", "tag"],
            entities: {
                a: { score: 10, tag: "x" },
                b: { score: 12.5, tag: "y" },
                c: { score: 7, tag: "z" },
            },
        };

        const defs = computeAttributeDefs(sampleMetadata);

        expect(defs).toBeDefined();
        expect(defs.score).toBeDefined();
        expect(defs.score.type).toBe("quantitative");
        expect(defs.tag).toBeDefined();
        expect(defs.tag.type).toBe("nominal");
    });

    it("preserves existing definitions and only fills missing fields", () => {
        const sampleMetadata = {
            attributeNames: ["age", "gender", "maybeEmpty"],
            entities: {
                e1: { age: 30, gender: "M", maybeEmpty: null },
                e2: { age: 25, gender: "F", maybeEmpty: undefined },
                e3: { age: 40, gender: "F" },
            },
        };

        const existingDefs = {
            age: { type: "nominal", label: "age-as-label" },
        };

        const defs = computeAttributeDefs(sampleMetadata, existingDefs);

        // existing def preserved (not overwritten)
        expect(defs.age).toBeDefined();
        expect(defs.age.type).toBe("nominal");
        expect(defs.age.label).toBe("age-as-label");

        // inferred fields added
        expect(defs.gender).toBeDefined();
        expect(defs.gender.type).toBe("nominal");

        expect(defs.maybeEmpty).toBeDefined();
        expect(defs.maybeEmpty.type).toBe("nominal");
    });

    it("creates minimal defs for single-field metadata", () => {
        const sampleMetadata = {
            attributeNames: ["single"],
            entities: {
                x: { single: "value" },
            },
        };

        const defs = computeAttributeDefs(sampleMetadata);
        expect(defs.single).toBeDefined();
        expect(typeof defs.single.type).toBe("string");
    });

    it("uses ancestor def when ancestor has a type (no leaf def created)", () => {
        const sampleMetadata = {
            attributeNames: ["group.sub"],
            entities: {
                a: { "group.sub": "x" },
                b: { "group.sub": "y" },
            },
        };

        const existingDefs = {
            group: { type: "nominal", title: "Group" },
        };

        const defs = computeAttributeDefs(sampleMetadata, existingDefs, ".");

        // No new leaf def should be created because ancestor provides type
        expect(defs["group.sub"]).toBeUndefined();
        // Ancestor def is unchanged and still provides type
        expect(defs.group).toBeDefined();
        expect(defs.group.type).toBe("nominal");
    });

    it("creates leaf def when ancestor def lacks type (ancestor unchanged)", () => {
        const sampleMetadata = {
            attributeNames: ["group.sub"],
            entities: {
                a: { "group.sub": 1 },
                b: { "group.sub": 2 },
            },
        };

        const existingDefs = {
            group: { title: "GroupWithoutType" }, // no type
        };

        const defs = computeAttributeDefs(sampleMetadata, existingDefs, ".");

        // Ancestor def remains without a type
        expect(defs.group).toBeDefined();
        expect(defs.group.type).toBeUndefined();

        // Leaf def should be created with inferred quantitative type
        expect(defs["group.sub"]).toBeDefined();
        expect(defs["group.sub"].type).toBe("quantitative");
    });

    it("fills missing type on existing leaf def by inferring when no ancestor type", () => {
        const sampleMetadata = {
            attributeNames: ["group.sub"],
            entities: {
                a: { "group.sub": 3 },
                b: { "group.sub": 4 },
            },
        };

        const existingDefs = {
            "group.sub": { title: "LeafOnlyNoType" },
        };

        const defs = computeAttributeDefs(sampleMetadata, existingDefs, ".");

        expect(defs["group.sub"]).toBeDefined();
        expect(defs["group.sub"].type).toBe("quantitative");
        // Ensure ancestor is not added or modified
        expect(defs.group).toBeUndefined();
    });
});

describe("combineSampleMetadata", () => {
    it("merges two disjoint sample metadata objects", () => {
        const a = {
            entities: {
                s1: { a1: 1 },
                s2: { a1: 2 },
            },
            attributeNames: ["a1"],
            attributeDefs: { a1: { type: "quantitative" } },
        };

        const b = {
            entities: {
                s2: { b1: "x" },
                s3: { b1: "y" },
            },
            attributeNames: ["b1"],
            attributeDefs: { b1: { type: "nominal" } },
        };

        const combined = combineSampleMetadata(a, b);

        expect(combined.attributeNames).toEqual(["a1", "b1"]);
        expect(combined.attributeDefs).toBeDefined();
        expect(combined.attributeDefs.a1).toBeDefined();
        expect(combined.attributeDefs.b1).toBeDefined();

        // entities should include union of ids
        expect(Object.keys(combined.entities).sort()).toEqual(
            ["s1", "s2", "s3"].sort()
        );

        expect(combined.entities.s1).toEqual({ a1: 1, b1: undefined });
        expect(combined.entities.s2).toEqual({ a1: 2, b1: "x" });
        expect(combined.entities.s3).toEqual({ a1: undefined, b1: "y" });
    });

    it("throws on duplicate attribute names", () => {
        const a = { entities: { s1: { a: 1 } }, attributeNames: ["a"] };
        const b = { entities: { s2: { a: 2 } }, attributeNames: ["a"] };
        expect(() => combineSampleMetadata(a, b)).toThrow(
            /Duplicate attribute names/
        );
    });

    it("throws on duplicate attributeDefs keys", () => {
        const a = {
            entities: {},
            attributeNames: ["a"],
            attributeDefs: { x: { type: "nominal" } },
        };
        const b = {
            entities: {},
            attributeNames: ["b"],
            attributeDefs: { x: { type: "quantitative" } },
        };
        expect(() => combineSampleMetadata(a, b)).toThrow(
            /Duplicate attribute definition key/
        );
    });
});
