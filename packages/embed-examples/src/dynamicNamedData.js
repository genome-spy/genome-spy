import { embed } from "@genome-spy/core";

/** @type {import("@genome-spy/core/spec/root").RootSpec} */
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
                        // Domain has to be specified explicitly now.
                        // TODO: Update domain upon data update
                        domain: [
                            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                            16, 17, 18, 19, 20,
                        ],
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
    // TODO: updateNamedData could call requestRender implicitly
};

const animate = () => {
    update();
    window.requestAnimationFrame(animate);
};

animate();
