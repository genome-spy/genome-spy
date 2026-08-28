import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";

const getFormData = () =>
    ["A", "B"].map((x) => ({
        x,
        text: /** @type {HTMLInputElement} */ (document.getElementById(x))
            .value,
    }));

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    datasets: {
        myData: getFormData(),
    },
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

const container = document.getElementById("container");

const api = await embed(container, spec);

document.getElementById("form").addEventListener("input", () => {
    api.datasets.set("myData", getFormData());
});
