import { describe, expect, test } from "vitest";
import FlowNode, { BEHAVIOR_CLONES } from "./flowNode.js";
import {
    removeRedundantCloneTransforms,
    validateLinks,
} from "./flowOptimizer.js";
import CloneTransform from "./transforms/clone.js";
import Collector from "./collector.js";
import DataFlow from "./dataFlow.js";
import { combineIdenticalDataSources } from "./flowOptimizer.js";
import InlineSource from "./sources/inlineSource.js";
import UrlSource from "./sources/urlSource.js";
import { makeParamMediatorProvider } from "./flowTestUtils.js";

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
        expect(branching.children[2]).toBe(c);
    });
});

/** @type {import("../view/view.js").default} */
const viewStub = /** @type {any} */ (
    Object.assign(makeParamMediatorProvider(), {
        getBaseUrl: () => "",
    })
);

describe("Merge indentical data sources", () => {
    test("Merges correctly", () => {
        /** @type {DataFlow} */
        const dataFlow = new DataFlow();

        const a = new UrlSource({ url: "http://genomespy.app/" }, viewStub);
        const ac = new Collector();
        a.addChild(ac);

        const b = new UrlSource({ url: "http://genomespy.app/" }, viewStub);
        const bc = new Collector();
        b.addChild(bc);

        const c = new UrlSource({ url: "http://helsinki.fi/" }, viewStub);
        const cc = new Collector();
        c.addChild(cc);

        dataFlow.addDataSource(a);
        dataFlow.addDataSource(b);
        dataFlow.addDataSource(c);

        dataFlow.addCollector(ac);
        dataFlow.addCollector(bc);
        dataFlow.addCollector(cc);

        combineIdenticalDataSources(dataFlow);

        expect(dataFlow.dataSources.length).toEqual(2);

        const entries = dataFlow.dataSources;
        const sharedIdentifier = a.identifier;
        expect(entries).toContain(a);
        expect(entries).toContain(c);
        expect(
            entries.filter((source) => source.identifier == sharedIdentifier)
        ).toEqual([a]);

        expect(new Set(a.children)).toEqual(new Set([ac, bc]));
        expect(c.children[0]).toBe(cc);

        for (const dataSource of dataFlow.dataSources) {
            // Cheat that we loaded something
            dataSource.complete();
        }

        expect(ac.completed).toBeTruthy();
        expect(bc.completed).toBeTruthy();
        expect(cc.completed).toBeTruthy();
    });

    test("Does not merge those with undefined identifier", () => {
        /** @type {DataFlow} */
        const dataFlow = new DataFlow();

        const a = new InlineSource({ values: [1, 2, 3] }, viewStub);
        const b = new InlineSource({ values: [1, 2, 3] }, viewStub);

        dataFlow.addDataSource(a);
        dataFlow.addDataSource(b);

        combineIdenticalDataSources(dataFlow);

        const entries = dataFlow.dataSources;
        expect(entries).toContain(a);
        expect(entries).toContain(b);
    });
});
