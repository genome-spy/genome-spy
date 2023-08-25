import { embed } from "@genome-spy/core/index.js";
import "@genome-spy/core/styles/genome-spy.scss";

// --- https://github.com/genome-spy/genome-spy/issues/155
//import { embed } from "@genome-spy/core";
//import "@genome-spy/core/style.css";

/** @type {import("@genome-spy/core/spec/root").RootSpec} */
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
