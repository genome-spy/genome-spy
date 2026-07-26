import { describe, expect, test } from "vitest";

import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import NamedSource from "./sources/namedSource.js";

/**
 * @param {import("../view/view.js").default} view
 */
function getRows(view) {
    return Array.from(view.flowHandle.collector.getData());
}

/**
 * @param {import("../view/view.js").default} root
 * @param {string} name
 */
function getView(root, name) {
    const view = root
        .getDescendants()
        .find((candidate) => candidate.explicitName === name);
    if (!view) {
        throw new Error(`View "${name}" not found.`);
    }
    return view;
}

describe("named dataset scopes", () => {
    test("resolves declarations lexically and shares only one binding", async () => {
        /** @type {import("../spec/root.js").RootSpec} */
        const spec = {
            datasets: {
                shared: [{ value: "root" }],
            },
            vconcat: [
                {
                    name: "rootConsumer",
                    data: { name: "shared" },
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "nominal" },
                    },
                },
                {
                    name: "localOwner",
                    datasets: {
                        shared: [{ value: "local" }],
                    },
                    vconcat: [
                        {
                            name: "localConsumerA",
                            data: { name: "shared" },
                            mark: "point",
                            encoding: {
                                x: { field: "value", type: "nominal" },
                            },
                        },
                        {
                            name: "localConsumerB",
                            data: { name: "shared" },
                            mark: "point",
                            encoding: {
                                x: { field: "value", type: "nominal" },
                            },
                        },
                    ],
                },
            ],
        };

        const { view, context } = await createHeadlessEngine(spec);
        const rootConsumer = getView(view, "rootConsumer");
        const localConsumerA = getView(view, "localConsumerA");
        const localConsumerB = getView(view, "localConsumerB");

        expect(getRows(rootConsumer).map((datum) => datum.value)).toEqual([
            "root",
        ]);
        expect(getRows(localConsumerA).map((datum) => datum.value)).toEqual([
            "local",
        ]);
        expect(getRows(localConsumerB).map((datum) => datum.value)).toEqual([
            "local",
        ]);

        expect(localConsumerA.flowHandle.dataSource).toBe(
            localConsumerB.flowHandle.dataSource
        );
        expect(rootConsumer.flowHandle.dataSource).not.toBe(
            localConsumerA.flowHandle.dataSource
        );
        expect(
            context.dataFlow.dataSources.filter(
                (source) => source instanceof NamedSource
            )
        ).toHaveLength(2);
        expect(() => context.dataFlow.findNamedDataSource("shared")).toThrow(
            /ambiguous.*ViewHandle\.datasets\.set/i
        );
    });

    test("keeps repeated imported dataset declarations independent", async () => {
        /** @type {import("../spec/root.js").RootSpec} */
        const spec = {
            templates: {
                panel: {
                    datasets: {
                        values: [{ value: "imported" }],
                    },
                    data: { name: "values" },
                    mark: "point",
                    encoding: {
                        x: { field: "value", type: "nominal" },
                    },
                },
            },
            vconcat: [
                {
                    name: "first",
                    import: { template: "panel" },
                },
                {
                    name: "second",
                    import: { template: "panel" },
                },
            ],
        };

        const { view } = await createHeadlessEngine(spec);
        const first = getView(view, "first");
        const second = getView(view, "second");

        expect(getRows(first).map((datum) => datum.value)).toEqual([
            "imported",
        ]);
        expect(getRows(second).map((datum) => datum.value)).toEqual([
            "imported",
        ]);
        expect(first.flowHandle.dataSource).not.toBe(
            second.flowHandle.dataSource
        );
        expect(first.flowHandle.dataSource.identifier).toBe("values");
        expect(second.flowHandle.dataSource.identifier).toBe("values");
    });

    test("resolves imported named lookup data from the imported root", async () => {
        /** @type {import("../spec/root.js").RootSpec} */
        const spec = {
            templates: {
                translation: {
                    datasets: {
                        geneticCode: [
                            { codon: "ATG", aminoAcid: "M" },
                            { codon: "TAA", aminoAcid: "STOP" },
                        ],
                    },
                    data: {
                        values: [{ codon: "ATG" }, { codon: "TAA" }],
                    },
                    transform: [
                        {
                            type: "lookup",
                            from: { name: "geneticCode" },
                            key: "codon",
                        },
                    ],
                    mark: "point",
                    encoding: {
                        x: { field: "codon", type: "nominal" },
                    },
                },
            },
            vconcat: [
                {
                    name: "translation",
                    import: { template: "translation" },
                },
            ],
        };

        const { view } = await createHeadlessEngine(spec);
        const translation = getView(view, "translation");

        expect(getRows(translation).map((datum) => datum.aminoAcid)).toEqual([
            "M",
            "STOP",
        ]);
    });
});
