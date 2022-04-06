import { describe, expect, test } from "vitest";
import FlowNode from "./flowNode";
import { validateLinks } from "./flowOptimizer";

describe("Flow mutation", () => {
    test("Excise a terminal node", () => {
        const a = new FlowNode();
        const b = new FlowNode();

        a.addChild(b);
        b.excise();

        expect(a.children[0]).toBeUndefined();
        expect(b.parent).toBeUndefined();

        expect(validateLinks(a)).toBeTruthy();
    });

    test("Excise a node in the middle", () => {
        const a = new FlowNode();
        const b = new FlowNode();
        const c = new FlowNode();

        a.addChild(b);
        b.addChild(c);
        b.excise();

        expect(a.children[0]).toBe(c);
        expect(c.parent).toBe(a);

        expect(validateLinks(a)).toBeTruthy();
    });

    test("Insert as parent", () => {
        const a = new FlowNode();
        const b = new FlowNode();
        const c = new FlowNode();
        const d = new FlowNode();

        a.addChild(c);
        a.addChild(d);
        c.insertAsParent(b);

        expect(a.children[0]).toBe(b);
        expect(a.children[1]).toBe(d);
        expect(a.children[0].children[0]).toBe(c);

        expect(validateLinks(a)).toBeTruthy();
    });
});
