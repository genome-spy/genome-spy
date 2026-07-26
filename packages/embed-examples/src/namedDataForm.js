import { embed } from "@genome-spy/core/minimal";

const getFormData = () =>
    ["A", "B"].map((x) => ({
        x,
        text: /** @type {HTMLInputElement} */ (document.getElementById(x))
            .value,
    }));

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "namedDataForm",
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
const dataOwner = api.views.get({
    scope: [],
    view: "namedDataForm",
});

document.getElementById("form").addEventListener("input", () => {
    dataOwner.datasets.set("myData", getFormData());
});
