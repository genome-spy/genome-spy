import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import { createDatumSearch } from "@genome-spy/core/search";

const api = await embed(
    "#container",
    {
        height: 100,
        data: {
            values: [
                {
                    symbol: "TP53",
                    transcript: "A",
                    chrom: "chrA",
                    start: 10,
                    end: 20,
                },
                {
                    symbol: "TP53",
                    transcript: "B",
                    chrom: "chrB",
                    start: 25,
                    end: 40,
                },
                {
                    symbol: "BRCA1",
                    transcript: "C",
                    chrom: "chrA",
                    start: 70,
                    end: 80,
                },
            ],
        },
        mark: "rect",
        encoding: {
            x: {
                chrom: "chrom",
                pos: "start",
                type: "locus",
                scale: {
                    name: "genome",
                    assembly: {
                        contigs: [
                            { name: "chrA", size: 100 },
                            { name: "chrB", size: 200 },
                        ],
                    },
                    zoom: true,
                },
            },
            x2: { chrom: "chrom", pos: "end" },
            search: { field: "symbol" },
        },
    },
    {
        renderer:
            new URLSearchParams(location.search).get("renderer") === "canvas"
                ? "canvas"
                : "webgl",
    }
);
const search = createDatumSearch(api.views);
const input = /** @type {HTMLInputElement} */ (
    document.querySelector("#query")
);
const status = document.querySelector("#status");
const matches = document.querySelector("#matches");
document.querySelector("#search").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = search.findDatums(input.value, { limit: 10 });
    status.textContent = `${result.matches.length} loaded matches${result.truncated ? "; more matches exist" : ""}. Choose a candidate to navigate.`;
    matches.replaceChildren();
    for (const match of result.matches) {
        for (const target of match.targets) {
            const item = document.createElement("li");
            const button = document.createElement("button");
            button.textContent = `${match.datum.symbol}, transcript ${match.datum.transcript}, ${match.datum.chrom}, ${target.channel}`;
            button.addEventListener("click", async () => {
                const [begin, end] = target.interval;
                await target.scale.zoomTo([
                    begin,
                    target.kind === "locus" ? end - 1 : end,
                ]);
                status.textContent = `Navigated to transcript ${match.datum.transcript}.`;
            });
            item.append(button);
            matches.append(item);
        }
    }
});
window.addEventListener("pagehide", () => api.finalize(), { once: true });
