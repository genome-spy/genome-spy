// @ts-nocheck
import { describe, expect, it } from "vitest";
import { VISIT_SKIP, VISIT_STOP } from "@genome-spy/core/view/view.js";
import { markViewAsChrome } from "@genome-spy/core/view/viewSelectors.js";
import { buildViewTree } from "./viewTree.js";

function createMockView(options) {
    const view = {
        explicitName: options.name,
        name: options.name,
        constructor: { name: options.constructorName ?? "Object" },
        spec: options.spec ?? {},
        parent: options.parent ?? null,
        children: options.children ?? [],
        paramRuntime: options.paramRuntime ?? {
            paramConfigs: new Map(),
            getValue: () => undefined,
        },
        getTitleText: () => options.title,
        getEncoding: () => options.encoding ?? {},
        getLayoutAncestors() {
            return this.parent
                ? [this, ...this.parent.getLayoutAncestors()]
                : [this];
        },
        getDataAncestors() {
            return this.getLayoutAncestors();
        },
        getPathString() {
            return this.getLayoutAncestors()
                .map((ancestor) => ancestor.name)
                .reverse()
                .join("/");
        },
        isVisible: () => options.visible ?? true,
        isVisibleInSpec: () => options.visible ?? true,
        getMarkType: () =>
            typeof options.spec?.mark === "string"
                ? options.spec.mark
                : options.spec?.mark?.type,
        visit(visitor) {
            const result = visitor(this);
            if (result === VISIT_STOP) {
                return VISIT_STOP;
            }

            if (result !== VISIT_SKIP) {
                for (const child of this.children) {
                    const childResult = child.visit(visitor);
                    if (childResult === VISIT_STOP) {
                        return VISIT_STOP;
                    }
                }
            }
        },
    };

    for (const child of view.children) {
        child.parent = view;
    }

    return view;
}

describe("buildViewTree", () => {
    it("builds a normalized hierarchy rooted at the top-level spec", () => {
        const sidebar = createMockView({
            name: "sample-sidebar",
            title: "Sidebar",
            spec: {
                hconcat: [],
            },
            children: [
                createMockView({
                    name: "sample-labels",
                    title: "Sample",
                    spec: {
                        mark: "text",
                    },
                }),
            ],
        });
        markViewAsChrome(sidebar, { skipSubtree: true });

        const emptyContainer = createMockView({
            name: "sampleSummaries",
            title: "sampleSummaries",
            spec: {
                vconcat: [],
            },
        });

        const hiddenBranch = createMockView({
            name: "hidden-track",
            title: "Hidden track",
            visible: false,
            spec: {
                layer: [],
            },
            children: [
                createMockView({
                    name: "hidden-child",
                    title: "Hidden child",
                    spec: {
                        mark: "rect",
                    },
                }),
            ],
        });

        const leaf = createMockView({
            name: "points",
            title: "Points",
            spec: {
                mark: "point",
                encoding: {
                    y: {
                        field: "value",
                        type: "quantitative",
                    },
                },
            },
            encoding: {
                y: { field: "value", type: "quantitative" },
            },
        });

        const anonymousLeaf = createMockView({
            title: "Anonymous annotation",
            spec: {
                mark: "rule",
            },
        });

        const layer = createMockView({
            name: "track",
            title: "Track",
            description: "Main track for the current cohort.",
            spec: {
                layer: [],
                description: "Main track for the current cohort.",
                data: { name: "track-data" },
                encoding: {
                    x: {
                        field: "position",
                        type: "locus",
                    },
                },
            },
            encoding: {
                x: { field: "position", type: "locus" },
            },
            children: [leaf, anonymousLeaf],
        });

        const sampleView = createMockView({
            name: "samples",
            title: "Samples",
            description: "Top-level sample view.",
            constructorName: "SampleView",
            spec: {
                description: "Top-level sample view.",
                data: { name: "samples" },
            },
            paramRuntime: {
                paramConfigs: new Map([
                    [
                        "brush",
                        {
                            name: "brush",
                            persist: true,
                            select: {
                                type: "interval",
                                encodings: ["x"],
                            },
                        },
                    ],
                ]),
                getValue: (paramName) =>
                    paramName === "brush"
                        ? {
                              type: "interval",
                              intervals: {
                                  x: [0, 1],
                              },
                          }
                        : undefined,
            },
            children: [emptyContainer, sidebar, hiddenBranch, layer],
        });

        const root = createMockView({
            name: "viewRoot",
            title: "Visualization root",
            description: ["Top-level visualization.", "Includes samples."],
            spec: {
                description: ["Top-level visualization.", "Includes samples."],
            },
            children: [sampleView],
        });

        const tree = buildViewTree({
            getSampleView: () => sampleView,
            genomeSpy: {
                spec: {
                    genomes: {
                        hg38: {},
                    },
                    assembly: "hg38",
                    background: "#fff",
                },
                viewRoot: root,
            },
        });

        expect(tree.rootConfig).toEqual({
            assembly: "hg38",
            genomes: ["hg38"],
        });
        expect(tree.root).toEqual(
            expect.objectContaining({
                kind: "root",
                type: "root",
                name: "viewRoot",
                title: "Visualization root",
                description: "Top-level visualization.\nIncludes samples.",
                selector: undefined,
            })
        );
        expect(tree.root.children).toHaveLength(1);
        expect(tree.root.children[0]).toEqual(
            expect.objectContaining({
                kind: "container",
                type: "sampleView",
                name: "samples",
                title: "Samples",
                description: "Top-level sample view.",
                selector: {
                    scope: [],
                    view: "samples",
                },
                data: {
                    kind: "named",
                    source: "samples",
                },
            })
        );
        expect(tree.root.children[0].selectionDeclarations).toEqual([
            expect.objectContaining({
                selectionType: "interval",
                label: "brush",
                active: true,
                selector: {
                    scope: [],
                    param: "brush",
                },
                encodings: ["x"],
            }),
        ]);
        expect(tree.root.children[0].children).toHaveLength(2);
        expect(tree.root.children[0].children[0]).toEqual(
            expect.objectContaining({
                kind: "container",
                type: "layer",
                name: "hidden-track",
                title: "Hidden track",
                visible: false,
                collapsed: true,
                childCount: 1,
                encodings: {},
                selector: {
                    scope: [],
                    view: "hidden-track",
                },
            })
        );
        expect(tree.root.children[0].children[0].children).toHaveLength(0);
        expect(tree.root.children[0].children[1]).toEqual(
            expect.objectContaining({
                kind: "container",
                type: "layer",
                name: "track",
                title: "Track",
                description: "Main track for the current cohort.",
                encodings: {},
                selector: {
                    scope: [],
                    view: "track",
                },
                data: {
                    kind: "named",
                    source: "track-data",
                },
            })
        );
        expect(tree.root.children[0].children[1].children).toHaveLength(2);
        expect(tree.root.children[0].children[1].children[0]).toEqual(
            expect.objectContaining({
                kind: "leaf",
                type: "unit",
                name: "points",
                markType: "point",
                selector: {
                    scope: [],
                    view: "points",
                },
            })
        );
        expect(tree.root.children[0].children[1].children[0].encodings).toEqual(
            {
                y: expect.objectContaining({
                    sourceKind: "field",
                    field: "value",
                    type: "quantitative",
                    inherited: false,
                }),
            }
        );
        expect(
            tree.root.children[0].children[1].children.some(
                (child) => child.name === "sample-labels"
            )
        ).toBe(false);
        expect(
            tree.root.children[0].children[1].children.some(
                (child) =>
                    child.title === "Anonymous annotation" &&
                    child.selector === undefined
            )
        ).toBe(true);
        expect(tree.root.children[0].children[1].children[1].encodings).toEqual(
            {}
        );
    });

    it("joins multi-line descriptions from the spec", () => {
        const root = createMockView({
            name: "viewRoot",
            title: "Visualization root",
            spec: {
                description: ["First line", "Second line"],
            },
        });

        const tree = buildViewTree({
            getSampleView: () => undefined,
            genomeSpy: {
                spec: {},
                viewRoot: root,
            },
        });

        expect(tree.root.description).toBe("First line\nSecond line");
    });
});
