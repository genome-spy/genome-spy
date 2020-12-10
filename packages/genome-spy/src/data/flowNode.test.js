import FlowNode from "./flowNode";

describe("Flow mutation", () => {
    test("Excise a terminal node", () => {
        const a = new FlowNode();
        const b = new FlowNode();

        a.addChild(b);
        b.excise();

        expect(a.children[0]).toBeUndefined();
        expect(b.parent).toBeUndefined();
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
    });
});
