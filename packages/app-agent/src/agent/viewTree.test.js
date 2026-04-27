// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { VISIT_SKIP, VISIT_STOP } from "@genome-spy/core/view/view.js";

const { getContextMenuFieldInfosMock } = vi.hoisted(() => ({
    getContextMenuFieldInfosMock: vi.fn(() => []),
}));

vi.mock("@genome-spy/app/agentShared", async (importOriginal) => {
    const actual = await importOriginal();

    return {
        ...actual,
        getContextMenuFieldInfos: getContextMenuFieldInfosMock,
    };
});

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
        getScaleResolution: options.getScaleResolution ?? (() => undefined),
        getTitleText: () => options.title,
        getEncoding: () => options.encoding ?? options.spec?.encoding ?? {},
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

/**
 * @param {{
 *     type: string;
 *     domain?: unknown[];
 *     range?: unknown;
 *     scheme?: unknown;
 *     assembly?: unknown;
 *     reverse?: boolean;
 * }} options
 * @returns {any}
 */
function createMockScaleResolution(options) {
    const scale = {
        props: {
            type: options.type,
            scheme: options.scheme,
            assembly: options.assembly,
            reverse: options.reverse ?? false,
        },
        domain: () => options.domain,
        range: () => options.range,
    };

    return {
        getResolvedScaleType: () => options.type,
        getScale: () => scale,
    };
}

function createAgentApiStub(
    rootView,
    focusedView = rootView,
    rootSpec = rootView?.spec
) {
    return {
        getViewRoot: () => rootView,
        getFocusedView: () => focusedView,
        getRootSpec: () => rootSpec,
    };
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
                    [
                        "threshold",
                        {
                            name: "threshold",
                            description: "Threshold for the range control.",
                            persist: true,
                            value: 0.6,
                            bind: {
                                input: "range",
                                name: "Threshold",
                                description: "Adjust the cutoff.",
                                min: 0,
                                max: 1,
                                step: 0.1,
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
                        : paramName === "threshold"
                          ? 0.6
                          : undefined,
            },
            getScaleResolution: (channel) =>
                channel === "x"
                    ? {
                          type: "locus",
                          toComplex: (value) => ({
                              chrom: "chr1",
                              pos: value,
                          }),
                      }
                    : undefined,
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

        const tree = buildViewTree(
            createAgentApiStub(root, sampleView, {
                genomes: {
                    hg38: {},
                },
                assembly: "hg38",
            })
        );

        expect(tree.rootConfig).toEqual({
            assembly: "hg38",
            genomes: ["hg38"],
        });
        expect(tree.root).toEqual(
            expect.objectContaining({
                type: "other",
                name: "viewRoot",
                title: "Visualization root",
                description: "Top-level visualization.\nIncludes samples.",
                selector: undefined,
                visible: true,
            })
        );
        expect(tree.root).not.toHaveProperty("encodings");
        expect(tree.root).not.toHaveProperty("parameterDeclarations");
        expect(tree.root.children).toHaveLength(2);
        expect(tree.root.children[0]).toEqual(
            expect.objectContaining({
                type: "layer",
                name: "ideogram-track",
                title: "Chromosome Ideogram",
                visible: true,
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
            "parameterDeclarations"
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
            "parameterDeclarations"
        );
        expect(tree.root.children[1].children).toHaveLength(2);
        expect(tree.root.children[1].children[0]).toEqual(
            expect.objectContaining({
                type: "sampleView",
                name: "samples",
                title: "Samples",
                description: "Top-level sample view.",
                visible: true,
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
        expect(tree.root.children[1].children[0].parameterDeclarations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    parameterType: "selection",
                    selectionType: "interval",
                    label: "brush",
                    selector: {
                        scope: [],
                        param: "brush",
                    },
                    description: "Brush the x-axis interval.",
                    encodings: ["x"],
                }),
                expect.objectContaining({
                    parameterType: "variable",
                    label: "Threshold",
                    selector: {
                        scope: [],
                        param: "threshold",
                    },
                    description: "Threshold for the range control.",
                    bind: expect.objectContaining({
                        input: "range",
                        label: "Threshold",
                        min: 0,
                        max: 1,
                        step: 0.1,
                    }),
                }),
            ])
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
        ).not.toHaveProperty("parameterDeclarations");
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
                visible: true,
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
            "parameterDeclarations"
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

        const tree = buildViewTree(createAgentApiStub(root));

        expect(tree.root.description).toBe("First line\nSecond line");
    });

    it("links aggregatable unit views to interval selection parameters", () => {
        const variants = createMockView({
            name: "variants",
            title: "Variants",
            spec: {
                mark: "point",
                encoding: {
                    x: { field: "position", type: "locus" },
                    color: { field: "impact", type: "nominal" },
                },
            },
            encoding: {
                x: { field: "position", type: "locus" },
                color: { field: "impact", type: "nominal" },
            },
            paramRuntime: {
                paramConfigs: new Map([
                    [
                        "brush",
                        {
                            name: "brush",
                            select: {
                                type: "interval",
                                encodings: ["x"],
                            },
                        },
                    ],
                ]),
                getValue: () => undefined,
            },
        });

        getContextMenuFieldInfosMock.mockReturnValueOnce([
            {
                view: variants,
            },
        ]);

        const tree = buildViewTree(createAgentApiStub(variants));

        expect(tree.root.aggregatableBySelections).toEqual([
            {
                scope: [],
                param: "brush",
            },
        ]);
    });

    it("keeps explicitly expanded branches open", () => {
        const expandedKey =
            "v:" + JSON.stringify({ scope: [], view: "annotation-track" });

        const sampleView = createMockView({
            name: "samples",
            title: "Samples",
            constructorName: "SampleView",
            spec: {
                data: {
                    name: "samples",
                },
            },
        });

        const root = createMockView({
            name: "viewRoot",
            title: "Visualization root",
            spec: {},
            children: [
                createMockView({
                    name: "data-tracks",
                    title: "Data Tracks",
                    spec: {
                        vconcat: [],
                    },
                    children: [
                        sampleView,
                        createMockView({
                            name: "annotation-track",
                            title: "Annotation track",
                            spec: {
                                layer: [],
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
                        }),
                    ],
                }),
            ],
        });

        const tree = buildViewTree(createAgentApiStub(root, sampleView), {
            expandedViewNodeKeys: [expandedKey],
        });

        expect(tree.root.children[0].children[1]).toMatchObject({
            title: "Annotation track",
        });
        expect(tree.root.children[0].children[1]).not.toHaveProperty(
            "collapsed"
        );
        expect(tree.root.children[0].children[1].children).toHaveLength(1);
    });

    it("keeps non-addressable branches expanded by default", () => {
        const anonymousBranch = createMockView({
            title: "Anonymous branch",
            spec: {
                layer: [],
            },
            children: [
                createMockView({
                    title: "Anonymous leaf",
                    spec: {
                        mark: "rule",
                    },
                }),
            ],
        });

        const root = createMockView({
            name: "samples",
            title: "Samples",
            constructorName: "SampleView",
            spec: {
                data: {
                    name: "samples",
                },
            },
            children: [anonymousBranch],
        });

        const tree = buildViewTree(createAgentApiStub(root));

        expect(tree.root.children[0]).toMatchObject({
            title: "Anonymous branch",
            selector: undefined,
            visible: true,
        });
        expect(tree.root.children[0]).not.toHaveProperty("collapsed");
        expect(tree.root.children[0].children).toHaveLength(1);
    });

    it("summarizes effective scale mappings on color encodings", () => {
        const colorLeaf = createMockView({
            name: "color-points",
            title: "Color points",
            spec: {
                mark: "point",
                encoding: {
                    color: {
                        field: "group",
                        type: "nominal",
                        scale: {
                            scheme: "category10",
                        },
                    },
                },
            },
            getScaleResolution: (channel) =>
                channel === "color"
                    ? createMockScaleResolution({
                          type: "ordinal",
                          domain: ["A", "B"],
                          range: ["#1f77b4", "#ff7f0e"],
                          scheme: "category10",
                      })
                    : undefined,
        });

        const tree = buildViewTree(createAgentApiStub(colorLeaf));

        expect(tree.root.encodings.color).toEqual(
            expect.objectContaining({
                sourceKind: "field",
                field: "group",
                type: "nominal",
                inherited: false,
                scale: {
                    type: "ordinal",
                    domain: ["A", "B"],
                    range: ["#1f77b4", "#ff7f0e"],
                    scheme: "category10",
                },
            })
        );
    });

    it("omits the range for positional scale summaries", () => {
        const positionalLeaf = createMockView({
            name: "positional-points",
            title: "Positional points",
            spec: {
                mark: "point",
                encoding: {
                    y: {
                        field: "value",
                        type: "quantitative",
                        scale: {
                            type: "linear",
                        },
                    },
                },
            },
            getScaleResolution: (channel) =>
                channel === "y"
                    ? createMockScaleResolution({
                          type: "linear",
                          domain: [0, 10],
                          range: [0, 400],
                      })
                    : undefined,
        });

        const tree = buildViewTree(createAgentApiStub(positionalLeaf));

        expect(tree.root.encodings.y.scale).toEqual(
            expect.objectContaining({
                type: "linear",
                domain: [0, 10],
            })
        );
        expect(tree.root.encodings.y.scale).not.toHaveProperty("range");
        expect(tree.root.encodings.y.scale).not.toHaveProperty("reverse");
    });
});
