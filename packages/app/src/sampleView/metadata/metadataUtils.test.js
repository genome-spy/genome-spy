// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
    buildPathTree,
    computeAttributeDefs,
    combineSampleMetadata,
    placeMetadataUnderGroup,
    replacePathSeparatorInKeys,
    METADATA_PATH_SEPARATOR,
    inferColumnSeparator,
    replacePathSeparator,
    inferMetadataTypesForNodes,
    normalizeColumnarKeys,
    wrangleMetadata,
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
            "escaped\\.single",
        ];

        const root = buildPathTree(paths, ".");

        // Top-level buckets
        expect(root.children.has("foo")).toBe(true);
        expect(root.children.has("blaa")).toBe(true);
        expect(root.children.has("single")).toBe(true);
        expect(root.children.has("escaped.single")).toBe(true);

        const foo = root.children.get("foo");
        expect(foo).toBeDefined();
        expect(foo.path).toBe("foo");
        // foo should have children: bar and baz
        expect(foo.children.has("bar")).toBe(true);
        expect(foo.children.has("baz")).toBe(true);

        const bar = foo.children.get("bar");
        expect(bar).toBeDefined();
        // full attribute path is preserved for intermediate node
        expect(bar.path).toBe(replacePathSeparator("foo.bar", "."));
        // bar should have its own children (baz, qux)
        expect(bar.children.has("baz")).toBe(true);
        expect(bar.children.has("qux")).toBe(true);

        const baz = bar.children.get("baz");
        expect(baz).toBeDefined();
        expect(baz.path).toBe(replacePathSeparator("foo.bar.baz", "."));
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

    it("escapes slashes in internal paths when separator is not defined", () => {
        const paths = ["A/B"];
        const root = buildPathTree(paths, null);
        const node = root.children.get("A/B");
        expect(node).toBeDefined();
        expect(node.path).toBe("A\\/B");
        expect(node.children.size).toBe(0);
    });
});

describe("inferColumnSeparator", () => {
    it("detects dot separator with recurring prefixes", () => {
        const columns = ["group.col1", "group.col2", "other.col"];
        expect(inferColumnSeparator(columns)).toBe(".");
    });

    it("detects underscore separator with recurring prefixes", () => {
        const columns = ["group_col1", "group_col2", "other_col"];
        expect(inferColumnSeparator(columns)).toBe("_");
    });

    it("detects slash separator with recurring prefixes", () => {
        const columns = ["group/col1", "group/col2", "other/col"];
        expect(inferColumnSeparator(columns)).toBe("/");
    });

    it("returns null when no recurring prefixes exist", () => {
        // Each prefix appears only once, so no hierarchy detected
        const columns = ["a.b", "c.d", "e.f"];
        expect(inferColumnSeparator(columns)).toBeNull();
    });

    it("returns null when fewer than 2 columns contain the separator", () => {
        const columns = ["col1", "col2.single", "col3"];
        expect(inferColumnSeparator(columns)).toBeNull();
    });

    it("returns null for empty or all-flat column names", () => {
        const columns = ["col1", "col2", "col3"];
        expect(inferColumnSeparator(columns)).toBeNull();
    });

    it("ignores null/undefined/empty column names", () => {
        const columns = [null, "group.col1", "", "group.col2", undefined];
        expect(inferColumnSeparator(columns)).toBe(".");
    });

    it("returns null for empty array", () => {
        expect(inferColumnSeparator([])).toBeNull();
    });

    it("prefers first valid separator when multiple have recurring prefixes", () => {
        // Both "." and "_" have recurring prefixes; "." comes first in the list
        const columns = ["group.col1", "group.col2", "other_a", "other_b"];
        expect(inferColumnSeparator(columns)).toBe(".");
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

describe("inferMetadataTypesForNodes", () => {
    it("infers types for hierarchical attributes with uniform and mixed groups", () => {
        // Helper to convert from "." separator to internal "/" separator
        const r = (s) => replacePathSeparator(s, ".");

        // Define raw types for attributes
        const rawTypes = new Map([
            ["sample", "nominal"],
            ["cohort", "nominal"],
            ["clin.PFI", "quantitative"],
            ["clin.OS", "quantitative"],
            ["clin.treatment", "nominal"],
            ["expr.CCNE1", "quantitative"],
            ["expr.MYC", "quantitative"],
            ["random.a", "nominal"],
            ["random.b", "nominal"],
            ["random.sub.a", "quantitative"],
            ["random2.sub.sub", "quantitative"],
        ]);

        // Extract attributes from rawTypes keys
        const attributes = Array.from(rawTypes.keys());

        // Build path tree with "." separator
        const root = buildPathTree(attributes, ".");

        // Compute types for all nodes
        const types = inferMetadataTypesForNodes(rawTypes, root);

        // Root level: sample and cohort are leaves with no parent type
        expect(types.get(r("sample"))).toBe("nominal");
        expect(types.get(r("cohort"))).toBe("nominal");

        // clin: mixed children (PFI=quantitative, OS=quantitative, treatment=nominal) → "unset"
        expect(types.get(r("clin"))).toBe("unset");
        expect(types.get(r("clin.PFI"))).toBe("quantitative");
        expect(types.get(r("clin.OS"))).toBe("quantitative");
        expect(types.get(r("clin.treatment"))).toBe("nominal");

        // expr: all leaves are quantitative (CCNE1, MYC) → "quantitative"
        expect(types.get(r("expr"))).toBe("quantitative");
        expect(types.get(r("expr.CCNE1"))).toBe("inherit");
        expect(types.get(r("expr.MYC"))).toBe("inherit");

        // random: all leaves are nominal (a, b) → "nominal"
        expect(types.get(r("random"))).toBe("unset");
        expect(types.get(r("random.a"))).toBe("nominal");
        expect(types.get(r("random.b"))).toBe("nominal");

        // random.sub: only leaf is a (quantitative) → "quantitative"
        expect(types.get(r("random.sub"))).toBe("quantitative");
        expect(types.get(r("random.sub.a"))).toBe("inherit");

        // random2: only leaf is random2.sub.sub (quantitative) → "quantitative"
        expect(types.get(r("random2"))).toBe("quantitative");
        expect(types.get(r("random2.sub"))).toBe("inherit");
        expect(types.get(r("random2.sub.sub"))).toBe("inherit");
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

    it("merges duplicate attributeDefs keys when defs are identical", () => {
        const a = {
            entities: {},
            attributeNames: ["a"],
            attributeDefs: {
                expression: {
                    type: "quantitative",
                    scale: { domainMid: 0, scheme: "redblue" },
                },
            },
        };
        const b = {
            entities: {},
            attributeNames: ["b"],
            attributeDefs: {
                expression: {
                    type: "quantitative",
                    scale: { domainMid: 0, scheme: "redblue" },
                },
            },
        };

        const combined = combineSampleMetadata(a, b);
        expect(combined.attributeDefs).toEqual({
            expression: {
                type: "quantitative",
                scale: { domainMid: 0, scheme: "redblue" },
            },
        });
    });

    it("merges duplicate attributeDefs keys when defs are complementary", () => {
        const a = {
            entities: {},
            attributeNames: ["a"],
            attributeDefs: {
                expression: { type: "quantitative" },
            },
        };
        const b = {
            entities: {},
            attributeNames: ["b"],
            attributeDefs: {
                expression: { scale: { domainMid: 0, scheme: "redblue" } },
            },
        };

        const combined = combineSampleMetadata(a, b);
        expect(combined.attributeDefs).toEqual({
            expression: {
                type: "quantitative",
                scale: { domainMid: 0, scheme: "redblue" },
            },
        });
    });

    it("throws on conflicting duplicate attributeDefs keys", () => {
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
            /Conflicting attribute definition/
        );
    });
});

describe("placeMetadataUnderGroup", () => {
    it("returns metadata unchanged when groupPath is empty", () => {
        const metadata = {
            sample: ["s1", "s2"],
            age: [30, 25],
            name: ["Alice", "Bob"],
        };
        const result = placeMetadataUnderGroup(metadata, []);
        expect(result).toEqual(metadata);
    });

    it("prefixes all non-sample attributes with group path", () => {
        const metadata = {
            sample: ["s1", "s2"],
            age: [30, 25],
            name: ["Alice", "Bob"],
        };
        const result = placeMetadataUnderGroup(metadata, ["clinical"]);
        expect(result).toEqual({
            sample: ["s1", "s2"],
            "clinical/age": [30, 25],
            "clinical/name": ["Alice", "Bob"],
        });
    });

    it("handles nested group paths", () => {
        const metadata = {
            sample: ["s1"],
            value: [100],
        };
        const result = placeMetadataUnderGroup(metadata, ["group", "subgroup"]);
        expect(result).toEqual({
            sample: ["s1"],
            "group/subgroup/value": [100],
        });
    });

    it("preserves sample column unchanged", () => {
        const sampleData = ["sample1", "sample2", "sample3"];
        const metadata = {
            sample: sampleData,
            attr1: ["a", "b", "c"],
        };
        const result = placeMetadataUnderGroup(metadata, ["group"]);
        expect(result.sample).toBe(sampleData);
    });

    it("handles metadata with only sample column", () => {
        const metadata = {
            sample: ["s1", "s2"],
        };
        const result = placeMetadataUnderGroup(metadata, ["group"]);
        expect(result).toEqual({
            sample: ["s1", "s2"],
        });
    });

    it("handles multiple attributes", () => {
        const metadata = {
            sample: ["s1", "s2"],
            age: [30, 25],
            name: ["Alice", "Bob"],
            score: [9.5, 8.2],
            active: [true, false],
        };
        const result = placeMetadataUnderGroup(metadata, ["patient"]);
        expect(result).toEqual({
            sample: ["s1", "s2"],
            "patient/age": [30, 25],
            "patient/name": ["Alice", "Bob"],
            "patient/score": [9.5, 8.2],
            "patient/active": [true, false],
        });
    });

    it("uses METADATA_PATH_SEPARATOR in prefix", () => {
        const metadata = {
            sample: ["s1"],
            attr: [1],
        };
        const result = placeMetadataUnderGroup(metadata, ["group"]);
        const keys = Object.keys(result);
        expect(keys).toContain(`group${METADATA_PATH_SEPARATOR}attr`);
    });

    it("handles attributes with existing hierarchy", () => {
        const metadata = {
            sample: ["s1", "s2"],
            "nested/path": [1, 2],
            "other/deep/attr": ["a", "b"],
        };
        const result = placeMetadataUnderGroup(metadata, ["group"]);
        expect(result).toEqual({
            sample: ["s1", "s2"],
            "group/nested/path": [1, 2],
            "group/other/deep/attr": ["a", "b"],
        });
    });

    it("preserves escaped separators in attribute names", () => {
        const metadata = {
            sample: ["s1"],
            "nested/under\\/path": [100],
        };
        const result = placeMetadataUnderGroup(metadata, ["group"]);
        expect(result).toEqual({
            sample: ["s1"],
            "group/nested/under\\/path": [100],
        });
    });

    it("handles complex case with multiple levels and escaped separators", () => {
        const metadata = {
            sample: ["s1", "s2"],
            simple: [1, 2],
            "level1/level2": [3, 4],
            "with\\/escaped": [5, 6],
            "mixed/path\\/with/escape": [7, 8],
        };
        const result = placeMetadataUnderGroup(metadata, ["root", "group"]);
        expect(result).toEqual({
            sample: ["s1", "s2"],
            "root/group/simple": [1, 2],
            "root/group/level1/level2": [3, 4],
            "root/group/with\\/escaped": [5, 6],
            "root/group/mixed/path\\/with/escape": [7, 8],
        });
    });

    it("handles group paths containing escaped slashes", () => {
        const metadata = {
            sample: ["s1"],
            attr: [100],
        };
        const result = placeMetadataUnderGroup(metadata, [
            "group/with/slash",
            "subgroup",
        ]);
        expect(result).toEqual({
            sample: ["s1"],
            "group\\/with\\/slash/subgroup/attr": [100],
        });
    });

    it("handles group paths with slashes and attributes with hierarchy", () => {
        const metadata = {
            sample: ["s1"],
            "nested/attr": [1],
            "escaped\\/part": [2],
        };
        const result = placeMetadataUnderGroup(metadata, [
            "root/name",
            "level",
        ]);
        expect(result).toEqual({
            sample: ["s1"],
            "root\\/name/level/nested/attr": [1],
            "root\\/name/level/escaped\\/part": [2],
        });
    });
});

describe("replacePathSeparatorInKeys", () => {
    it("replaces dot separator with slash in keys", () => {
        const obj = {
            "demographics.age": [30, 25],
            "demographics.gender": ["M", "F"],
        };
        const result = replacePathSeparatorInKeys(obj, ".");
        expect(result).toEqual({
            "demographics/age": [30, 25],
            "demographics/gender": ["M", "F"],
        });
    });

    it("ignores specified keys", () => {
        const obj = {
            sample: ["s1", "s2"],
            "clinical.age": [30, 25],
        };
        const result = replacePathSeparatorInKeys(obj, ".", "/", ["sample"]);
        expect(result).toEqual({
            sample: ["s1", "s2"],
            "clinical/age": [30, 25],
        });
    });
});

describe("normalizeColumnarKeys", () => {
    it("escapes slashes when separator is not defined", () => {
        const result = normalizeColumnarKeys(
            {
                sample: ["s1", "s2"],
                "A/B": [1, 2],
            },
            null
        );

        expect(result).toEqual({
            sample: ["s1", "s2"],
            "A\\/B": [1, 2],
        });
    });
});

describe("wrangleMetadata", () => {
    it("replaces separators and applies group prefixes", () => {
        const rows = [
            { sample: "s1", "group.a": 1, "group.b": 2 },
            { sample: "s2", "group.a": 3, "group.b": 4 },
        ];

        const attributeDefs = {
            "group/a": { type: "quantitative" },
            "group/b": { type: "quantitative" },
        };

        const result = wrangleMetadata(rows, attributeDefs, ".", "clinical");

        expect(result.columnarMetadata).toEqual({
            sample: ["s1", "s2"],
            "clinical/group/a": [1, 3],
            "clinical/group/b": [2, 4],
        });

        expect(result.attributeDefs).toEqual({
            "clinical/group/a": { type: "quantitative" },
            "clinical/group/b": { type: "quantitative" },
        });
    });

    it("replaces separators without grouping", () => {
        const rows = [
            { sample: "s1", "clin.age": 30 },
            { sample: "s2", "clin.age": 25 },
        ];

        const result = wrangleMetadata(rows, {}, ".");

        expect(result.columnarMetadata).toEqual({
            sample: ["s1", "s2"],
            "clin/age": [30, 25],
        });
        expect(result.attributeDefs).toEqual({});
    });

    it("applies group prefixes without separator conversion", () => {
        const rows = [
            { sample: "s1", age: 30 },
            { sample: "s2", age: 25 },
        ];

        const result = wrangleMetadata(
            rows,
            { age: { type: "quantitative" } },
            null,
            "clinical"
        );

        expect(result.columnarMetadata).toEqual({
            sample: ["s1", "s2"],
            "clinical/age": [30, 25],
        });
        expect(result.attributeDefs).toEqual({
            "clinical/age": { type: "quantitative" },
        });
    });

    it("does not split groupPath on slash unless separator is defined", () => {
        const rows = [{ sample: "s1", age: 30 }];

        const result = wrangleMetadata(
            rows,
            { age: { type: "quantitative" }, "": { type: "quantitative" } },
            null,
            "Expression/RNA"
        );

        expect(result.columnarMetadata).toEqual({
            sample: ["s1"],
            "Expression\\/RNA/age": [30],
        });
        expect(result.attributeDefs).toEqual({
            "Expression\\/RNA/age": { type: "quantitative" },
            "Expression\\/RNA": { type: "quantitative" },
        });
    });

    it('materializes attributes[""] to flat imported attributes when no group is set', () => {
        const rows = [
            { sample: "s1", TP53: 1.2, status: "A" },
            { sample: "s2", TP53: -0.2, status: "B" },
        ];

        const result = wrangleMetadata(rows, {
            "": { type: "quantitative", scale: { domainMid: 0 } },
            status: { type: "nominal" },
        });

        expect(result.attributeDefs).toEqual({
            TP53: { type: "quantitative", scale: { domainMid: 0 } },
            status: { type: "nominal" },
        });
    });

    it('does not materialize attributes[""] to leaves that inherit from non-root ancestors', () => {
        const rows = [
            { sample: "s1", "clinical.OS": 5, "clinical.PFI": 10 },
            { sample: "s2", "clinical.OS": 8, "clinical.PFI": 20 },
        ];

        const result = wrangleMetadata(
            rows,
            {
                "": { type: "nominal" },
                clinical: { type: "quantitative" },
            },
            "."
        );

        expect(result.attributeDefs).toEqual({
            clinical: { type: "quantitative" },
        });
    });

    it("skips columns marked for exclusion", () => {
        const rows = [
            { sample: "s1", a: 1, b: 2 },
            { sample: "s2", a: 3, b: 4 },
        ];

        const result = wrangleMetadata(
            rows,
            { a: { type: "quantitative" }, b: { type: "quantitative" } },
            null,
            null,
            new Set(["b"])
        );

        expect(result.columnarMetadata).toEqual({
            sample: ["s1", "s2"],
            a: [1, 3],
        });
        expect(result.attributeDefs).toEqual({
            a: { type: "quantitative" },
            b: { type: "quantitative" },
        });
    });
});
