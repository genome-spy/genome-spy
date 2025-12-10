import { describe, it, expect } from "vitest";
import { buildPathThree as buildPathTree } from "./metadataUtils.js";

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
