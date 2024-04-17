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
                        scale: { domain: [-1, 1] },
                    },
                },
            },
        ],
    }

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

    const updateData = (api) => {
        api.updateNamedData("dynamicData", generateData());
    }

    return (
        <>
            <GenomeSpy spec={spec} onEmbed={updateData}/>
        </>
    )
}


const root = createRoot(document.getElementById('container'))
root.render(<App />)