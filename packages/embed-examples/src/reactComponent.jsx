import { createRoot } from "react-dom/client";
// eslint-disable-next-line no-unused-vars
import React from "react";
// eslint-disable-next-line no-unused-vars
import GenomeSpy from "@genome-spy/react-component";

// eslint-disable-next-line no-unused-vars
const App = () => {
    /** @type {import("packages/core/src/spec/root.js").RootSpec} */
    const spec = {
        data: {
            name: "dynamicData",
        },
        hconcat: [
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
                        scale: { domain: [0, 1] },
                    },
                },
            },
        ],
    };
    const data = [
        { id: 1, x: 1, y: 0.2 },
        { id: 2, x: 2, y: 0.5 },
        { id: 3, x: 3, y: 1 },
    ];

    /** @type {(api: import("@genome-spy/core/types/embedApi.js").EmbedResult) => void} */
    const updateData = (api) => {
        api.updateNamedData("dynamicData", data);
    };

    return (
        <>
            <GenomeSpy spec={spec} onEmbed={updateData} />
        </>
    );
};

const root = createRoot(document.getElementById("container"));
root.render(<App />);
