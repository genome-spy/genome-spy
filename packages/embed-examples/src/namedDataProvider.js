import { embed } from "@genome-spy/core";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    height: 100,
    data: {
        name: "myData",
    },
    mark: "text",
    encoding: {
        x: { field: "x", type: "ordinal" },
        color: { field: "x", type: "nominal" },
        text: { field: "text" },
        size: { value: 100 },
    },
};

/**
 *
 * @param {string} name
 */
const namedDataProvider = (name) => {
    if (name == "myData") {
        return ["A", "B"].map((x) => ({
            x,
            text: /** @type {HTMLInputElement} */ (document.getElementById(x))
                .value,
        }));
    }
};

const container = document.getElementById("container");

const api = await embed(container, spec, {
    // The provider provides:
    // 1. the initial dataset
    // 2. any subsequent updated dataset
    namedDataProvider,
});

document.getElementById("form").addEventListener("input", () => {
    // Here we only signal that myData should be fetched from the provider
    api.updateNamedData("myData");
});
