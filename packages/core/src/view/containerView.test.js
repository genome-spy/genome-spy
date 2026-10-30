import { expect, test, vi } from "vitest";
import { ViewFactory } from "./viewFactory.js";
import { createTestViewContext } from "./testUtils.js";

test("failed concat and layer construction releases children with parent-owned outputs", async () => {
    const context = createTestViewContext();
    const host = /** @type {import("./concatView.js").default} */ (
        await context.createOrImportView({ vconcat: [] }, null, null, "host")
    );
    /** @type {import("./view.js").default[]} */
    const producers = [];
    const createView = ViewFactory.prototype.createView;
    const factorySpy = vi
        .spyOn(ViewFactory.prototype, "createView")
        .mockImplementation(function (...args) {
            const view = createView.apply(this, args);
            if (view.name === "producer" || view.name === "layerProducer") {
                producers.push(view);
            }
            return view;
        });

    /** @param {string} name */
    const producer = (name) => ({
        name,
        mark: /** @type {const} */ ("point"),
        data: { values: [{ x: 1 }] },
        transform: [
            {
                type: /** @type {const} */ ("values"),
                field: "x",
                param: { name: "values", push: /** @type {const} */ ("outer") },
            },
        ],
    });

    try {
        // Each producer belongs to its container's output scope. Removing it
        // separately would incorrectly trigger the live-producer preflight.
        await expect(
            host.addChildSpec({
                params: [{ name: "values" }],
                vconcat: [
                    producer("producer"),
                    {
                        params: [{ name: "values" }],
                        layer: [
                            producer("layerProducer"),
                            { mark: /** @type {any} */ ("nope") },
                        ],
                    },
                ],
            })
        ).rejects.toThrow("No such mark: nope");

        expect(producers).toHaveLength(2);
        expect(
            producers.every(
                (view) => view.paramRuntime.getDebugState().disposed
            )
        ).toBe(true);
        expect(host.children).toEqual([]);
        expect(host.spec).toMatchObject({ vconcat: [] });
    } finally {
        factorySpy.mockRestore();
        host.disposeSubtree();
    }
});

test("failed nested construction releases a producer owned by an unconfigured ancestor", async () => {
    const context = createTestViewContext();
    const host = /** @type {import("./concatView.js").default} */ (
        await context.createOrImportView(
            { params: [{ name: "values" }], vconcat: [] },
            null,
            null,
            "host"
        )
    );
    /** @type {import("../spec/view.js").UnitSpec} */
    const producer = {
        mark: "point",
        data: { values: [{ x: 1 }] },
        transform: [
            {
                type: "values",
                field: "x",
                param: { name: "values", push: "outer" },
            },
        ],
    };

    try {
        // A failed inner container may reference an outer owner that is not
        // part of that failed subtree. Its declaration must allow a retry.
        await expect(
            host.addChildSpec({
                vconcat: [
                    {
                        vconcat: [
                            producer,
                            { mark: /** @type {any} */ ("nope") },
                        ],
                    },
                ],
            })
        ).rejects.toThrow("No such mark: nope");
        expect(
            host.paramRuntime.getOutput("values").producerView
        ).toBeUndefined();

        await host.addChildSpec(producer);
        expect(host.paramRuntime.getValue("values")).toEqual([1]);
        expect(host.children).toHaveLength(1);
    } finally {
        host.disposeSubtree();
    }
});
