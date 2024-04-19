import React from "react";
import { createRoot } from "react-dom/client";
import GenomeSpy from "@genome-spy/react-component";

const App = () => {
    const spec = {
        "data": {
            "name": "dynamicData"
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
    }
    const data = [
        { id: 1, x: 1, y: 0.2, }, 
        { id: 2, x: 2, y: 0.5 },
        { id: 3, x: 3, y: 1 },
    ]

    const updateData = (api) => {
        api.updateNamedData("dynamicData", data);
    }

    return (
        <>
            <GenomeSpy spec={spec} onEmbed={updateData}/>
        </>
    )
}


const root = createRoot(document.getElementById('container'))
root.render(<App />)