// @ts-nocheck
import { describe, expect, it } from "vitest";
import { VISIT_SKIP, VISIT_STOP } from "@genome-spy/core/view/view.js";
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
        const rootSibling = createMockView({
            name: "ideogram-track",
            title: "Chromosome Ideogram",
            spec: {
                layer: [],
            },
            children: [
                createMockView({
                    name: "ideogram-band",
                    title: "Cytoband",
                    spec: {
                        mark: "rect",
                        encoding: {
                            x: {
                                field: "start",
                                type: "locus",
                                description: "Band start position",
                            },
                        },
                    },
                    encoding: {
                        x: {
                            field: "start",
                            type: "locus",
                            description: "Band start position",
                        },
                    },
                }),
            ],
        });

        const sampleSibling = createMockView({
            name: "annotation-track",
            title: "Annotation track",
            description: "Collapsed sibling of the focused sample view.",
            spec: {
                layer: [],
                description: "Collapsed sibling of the focused sample view.",
            },
            children: [
                createMockView({
                    name: "annotation-leaf",
                    title: "Annotation leaf",
                    spec: {
                        mark: "rule",
                    },
                }),
            ],
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
                        description: "Value per point",
                    },
                },
            },
            encoding: {
                y: {
                    field: "value",
                    type: "quantitative",
                    description: "Value per point",
                },
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
                data: {
                    name: "track-data",
                    description: "Track data source",
                },
                encoding: {
                    x: {
                        field: "position",
                        type: "locus",
                        description: "Genomic position",
                    },
                },
            },
            encoding: {
                x: {
                    field: "position",
                    type: "locus",
                    description: "Genomic position",
                },
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
                data: {
                    name: "samples",
                    description: "Sample collection source",
                },
            },
            paramRuntime: {
                paramConfigs: new Map([
                    [
                        "brush",
                        {
                            name: "brush",
                            description: "Brush the x-axis interval.",
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
            children: [hiddenBranch, layer],
        });

        const dataTracks = createMockView({
            name: "data-tracks",
            title: "Data Tracks",
            spec: {
                vconcat: [],
            },
            children: [sampleView, sampleSibling],
        });

        const root = createMockView({
            name: "viewRoot",
            title: "Visualization root",
            description: ["Top-level visualization.", "Includes samples."],
            spec: {
                description: ["Top-level visualization.", "Includes samples."],
            },
            children: [rootSibling, dataTracks],
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
                type: "root",
                name: "viewRoot",
                title: "Visualization root",
                description: "Top-level visualization.\nIncludes samples.",
                selector: undefined,
            })
        );
        expect(tree.root).not.toHaveProperty("encodings");
        expect(tree.root).not.toHaveProperty("selectionDeclarations");
        expect(tree.root.children).toHaveLength(2);
        expect(tree.root.children[0]).toEqual(
            expect.objectContaining({
                type: "layer",
                name: "ideogram-track",
                title: "Chromosome Ideogram",
                collapsed: true,
                childCount: 1,
                selector: {
                    scope: [],
                    view: "ideogram-track",
                },
            })
        );
        expect(tree.root.children[0]).not.toHaveProperty("data");
        expect(tree.root.children[0]).not.toHaveProperty("encodings");
        expect(tree.root.children[0]).not.toHaveProperty(
            "selectionDeclarations"
        );
        expect(tree.root.children[0]).not.toHaveProperty("children");
        expect(tree.root.children[1]).toEqual(
            expect.objectContaining({
                type: "vconcat",
                name: "data-tracks",
                title: "Data Tracks",
                selector: {
                    scope: [],
                    view: "data-tracks",
                },
            })
        );
        expect(tree.root.children[1]).not.toHaveProperty("encodings");
        expect(tree.root.children[1]).not.toHaveProperty(
            "selectionDeclarations"
        );
        expect(tree.root.children[1].children).toHaveLength(2);
        expect(tree.root.children[1].children[0]).toEqual(
            expect.objectContaining({
                type: "sampleView",
                name: "samples",
                title: "Samples",
                description: "Top-level sample view.",
                selector: {
                    scope: [],
                    view: "samples",
                },
                data: expect.objectContaining({
                    kind: "named",
                    source: "samples",
                    description: "Sample collection source",
                }),
            })
        );
        expect(tree.root.children[1].children[0]).toHaveProperty("data");
        expect(tree.root.children[1].children[0]).not.toHaveProperty(
            "encodings"
        );
        expect(tree.root.children[1].children[0].selectionDeclarations).toEqual(
            [
                expect.objectContaining({
                    selectionType: "interval",
                    label: "brush",
                    selector: {
                        scope: [],
                        param: "brush",
                    },
                    description: "Brush the x-axis interval.",
                    encodings: ["x"],
                    value: {
                        type: "interval",
                        intervals: {
                            x: [0, 1],
                        },
                    },
                }),
            ]
        );
        expect(tree.root.children[1].children[0].children).toHaveLength(2);
        expect(tree.root.children[1].children[0].children[0]).toEqual(
            expect.objectContaining({
                type: "layer",
                name: "hidden-track",
                title: "Hidden track",
                visible: false,
                collapsed: true,
                childCount: 1,
                selector: {
                    scope: [],
                    view: "hidden-track",
                },
            })
        );
        expect(
            tree.root.children[1].children[0].children[0]
        ).not.toHaveProperty("data");
        expect(
            tree.root.children[1].children[0].children[0]
        ).not.toHaveProperty("encodings");
        expect(
            tree.root.children[1].children[0].children[0]
        ).not.toHaveProperty("selectionDeclarations");
        expect(
            tree.root.children[1].children[0].children[0]
        ).not.toHaveProperty("children");
        expect(tree.root.children[1].children[0].children[1]).toEqual(
            expect.objectContaining({
                type: "layer",
                name: "track",
                title: "Track",
                description: "Main track for the current cohort.",
                selector: {
                    scope: [],
                    view: "track",
                },
                data: expect.objectContaining({
                    kind: "named",
                    source: "track-data",
                    description: "Track data source",
                }),
            })
        );
        expect(
            tree.root.children[1].children[0].children[1]
        ).not.toHaveProperty("encodings");
        expect(
            tree.root.children[1].children[0].children[1].children
        ).toHaveLength(2);
        expect(
            tree.root.children[1].children[0].children[1].children[0]
        ).toEqual(
            expect.objectContaining({
                type: "unit",
                name: "points",
                markType: "point",
                selector: {
                    scope: [],
                    view: "points",
                },
            })
        );
        expect(
            tree.root.children[1].children[0].children[1].children[0].encodings
        ).toEqual({
            y: expect.objectContaining({
                sourceKind: "field",
                field: "value",
                type: "quantitative",
                description: "Value per point",
                inherited: false,
            }),
        });
        expect(
            tree.root.children[1].children[0].children[1].children[0]
        ).not.toHaveProperty("children");
        expect(
            tree.root.children[1].children[0].children[1].children.some(
                (child) =>
                    child.title === "Anonymous annotation" &&
                    child.selector === undefined
            )
        ).toBe(true);
        expect(
            tree.root.children[1].children[0].children[1].children[1]
        ).not.toHaveProperty("encodings");
        expect(
            tree.root.children[1].children[0].children[1].children[1]
        ).not.toHaveProperty("children");
        expect(tree.root.children[1].children[1]).toEqual(
            expect.objectContaining({
                type: "layer",
                name: "annotation-track",
                title: "Annotation track",
                description: "Collapsed sibling of the focused sample view.",
                collapsed: true,
                childCount: 1,
                selector: {
                    scope: [],
                    view: "annotation-track",
                },
            })
        );
        expect(tree.root.children[1].children[1]).not.toHaveProperty("data");
        expect(tree.root.children[1].children[1]).not.toHaveProperty(
            "encodings"
        );
        expect(tree.root.children[1].children[1]).not.toHaveProperty(
            "selectionDeclarations"
        );
        expect(tree.root.children[1].children[1]).not.toHaveProperty(
            "children"
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
