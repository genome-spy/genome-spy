import { embed } from "@genome-spy/core";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    data: {
        name: "dynamicData",
    },
    hconcat: [
        {
            height: 250,
            width: 250,
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [-1, 1] },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [-1, 1] },
                },
                size: {
                    field: "size",
                    type: "quantitative",
                    scale: { domain: [0, 1], range: [4, 400] },
                },
                opacity: {
                    value: 0.8,
                },
            },
        },
        {
            height: 250,
            width: 500,
            mark: "rect",
            encoding: {
                x: {
                    field: "id",
                    type: "nominal",
                    scale: {
                        padding: 0.1,
                    },
                },
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [-1, 1] },
                },
            },
        },
    ],
};

const container = document.getElementById("container");

const api = await embed(container, spec);

const generateData = () => {
    const pi = 3.141;
    const count = 20;
    const offset = performance.now() / 1000;

    const data = [];

    for (let i = 0; i < count; i++) {
        const f = (i / count + offset * 0.3) * pi * 2;
        const d = Math.sin(offset * 1 + (i / count) * 3);
        data.push({
            id: i + 1,
            x: Math.sin(f) * d,
            y: Math.cos(f) * d,
            size: 1 - Math.abs(d),
        });
    }

    return data;
};

const update = () => {
    api.updateNamedData("dynamicData", generateData());
};

const animate = () => {
    update();
    window.requestAnimationFrame(animate);
};

animate();
