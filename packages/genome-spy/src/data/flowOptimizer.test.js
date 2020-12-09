import FlowNode, { BEHAVIOR_CLONES } from "./flowNode";
import { removeRedundantCloneTransforms, validateLinks } from "./flowOptimizer";
import CloneTransform from "./transforms/clone";

test("validateLinks() detects broken graph", () => {
    const root = new FlowNode();
    const a = new FlowNode();
    const b = new FlowNode();
    const c = new FlowNode();

    root.addChild(a);
    root.addChild(b);
    root.addChild(c);

    expect(validateLinks(root)).toBeTruthy();

    // Break it!
    b.parent = undefined;

    expect(validateLinks(root)).toBeFalsy();

    // Check handling of root

    const rootWithParent = new FlowNode();
    // Break it!
    rootWithParent.parent = new FlowNode();

    expect(validateLinks(rootWithParent)).toBeFalsy();
});

describe("removeRedundantCloneTransforms", () => {
    test("Removes redundancy from linear graph #1", () => {
        const a = new FlowNode();
        const b = new CloneTransform();
        const c = new FlowNode();
        const d = new CloneTransform();
        const e = new CloneTransform();
        const f = new FlowNode();

        a.addChild(b);
        b.addChild(c);
        c.addChild(d);
        d.addChild(e);
        e.addChild(f);

        removeRedundantCloneTransforms(a);

        expect(a.children[0]).toBe(c);
        expect(c.children[0]).toBe(f);
    });

    test("Removes redundancy from linear graph #2", () => {
        const a = new FlowNode();
        const b = new CloneTransform();
        const c = new FlowNode();
        const d = new CloneTransform();
        const e = new CloneTransform();
        const f = new FlowNode();

        a.addChild(b);
        b.addChild(c);
        c.addChild(d);
        d.addChild(e);
        e.addChild(f);

        // First CloneTransform should be retained
        removeRedundantCloneTransforms(a, true);

        expect(a.children[0]).toBe(b);
        expect(b.children[0]).toBe(c);
        expect(c.children[0]).toBe(f);
    });

    test("Node with cloning behavior satisfies cloning requirement", () => {
        class CloningFlowNode extends FlowNode {
            get behavior() {
                return BEHAVIOR_CLONES;
            }
        }

        const a = new FlowNode();
        const b = new CloningFlowNode();
        const c = new FlowNode();
        const d = new CloneTransform();
        const e = new FlowNode();

        a.addChild(b);
        b.addChild(c);
        c.addChild(d);
        d.addChild(e);

        removeRedundantCloneTransforms(a, true);

        expect(a.children[0]).toBe(b);
        expect(b.children[0]).toBe(c);
        expect(c.children[0]).toBe(e);
    });

    test("Removes redundancy from a branching graph", () => {
        const root = new FlowNode();
        const branching = new FlowNode();
        const a = new CloneTransform();
        const al = new FlowNode();
        const b = new CloneTransform();
        const bl = new FlowNode();
        const c = new CloneTransform();
        const cl = new FlowNode();

        root.addChild(branching);
        branching.addChild(a);
        branching.addChild(b);
        branching.addChild(c);
        a.addChild(al);
        b.addChild(bl);
        c.addChild(cl);

        removeRedundantCloneTransforms(root);

        // All but the last branch needs cloning
        expect(branching.children[0]).toBe(a);
        expect(branching.children[1]).toBe(b);
        expect(branching.children[2]).toBe(cl);
    });
});
