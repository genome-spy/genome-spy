// @ts-nocheck
import { describe, expect, it } from "vitest";
import { VISIT_SKIP, VISIT_STOP } from "@genome-spy/core/view/view.js";
import { markViewAsChrome } from "@genome-spy/core/view/viewSelectors.js";
import { buildViewTree } from "./viewTree.js";

function createMockView(options) {
    const view = {
        explicitName: options.name,
        name: options.name,
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
    it("builds a normalized hierarchy with local selection declarations", () => {
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
            children: [leaf],
        });

        const root = createMockView({
            name: "samples",
            title: "Samples",
            description: "Top-level sample view.",
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
            children: [emptyContainer, sidebar, layer],
        });

        const tree = buildViewTree({
            getSampleView: () => root,
            genomeSpy: {
                spec: {
                    genomes: {
                        hg38: {},
                    },
                    assembly: "hg38",
                    background: "#fff",
                },
            },
        });

        expect(tree.rootConfig).toEqual({
            assembly: "hg38",
            background: "#fff",
            genomes: ["hg38"],
        });
        expect(tree.root).toEqual(
            expect.objectContaining({
                kind: "root",
                type: "sampleView",
                name: "samples",
                title: "Samples",
                description: "Top-level sample view.",
                data: {
                    kind: "named",
                    source: "samples",
                },
            })
        );
        expect(tree.root.selectionDeclarations).toEqual([
            expect.objectContaining({
                selectionType: "interval",
                paramName: "brush",
                label: "brush",
                encodings: ["x"],
                active: true,
            }),
        ]);
        expect(tree.root.children).toHaveLength(1);
        expect(tree.root.children[0]).toEqual(
            expect.objectContaining({
                kind: "container",
                type: "layer",
                name: "track",
                title: "Track",
                description: "Main track for the current cohort.",
                data: {
                    kind: "named",
                    source: "track-data",
                },
            })
        );
        expect(
            tree.root.children[0].children.some(
                (child) => child.name === "sample-labels"
            )
        ).toBe(false);
        expect(tree.root.children[0].encodings).toEqual([
            expect.objectContaining({
                channel: "x",
                field: "position",
                type: "locus",
                inherited: false,
            }),
        ]);
        expect(tree.root.children[0].children).toHaveLength(1);
        expect(tree.root.children[0].children[0]).toEqual(
            expect.objectContaining({
                kind: "leaf",
                type: "unit",
                name: "points",
                markType: "point",
            })
        );
    });
});
