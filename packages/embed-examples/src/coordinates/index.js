import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import {
    parseCoordinates,
    formatCoordinates,
} from "@genome-spy/core/coordinates";

const api = await embed("#container", {
    height: 100,
    data: {
        values: [
            { chrom: "chrA", pos: 15 },
            { chrom: "chrB", pos: 25 },
        ],
    },
    mark: "point",
    encoding: {
        x: {
            chrom: "chrom",
            pos: "pos",
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
        size: { value: 100 },
    },
});
const scale = api.getScaleResolutionByName("genome");
const query = /** @type {HTMLInputElement} */ (
    document.querySelector("#query")
);
const status = document.querySelector("#status");

function showDomain() {
    const [begin, end] =
        /** @type {import("@genome-spy/core/types/coordinates.js").CoordinateLocus[]} */ (
            scale.getComplexDomain()
        );
    status.textContent = formatCoordinates([
        begin,
        { chrom: end.chrom, pos: end.pos + 1 },
    ]);
}
scale.addEventListener("domain", showDomain);
showDomain();
document
    .querySelector("#location")
    .addEventListener("submit", async (event) => {
        event.preventDefault();
        const result = parseCoordinates(query.value, scale.getAssembly());
        if (result.kind === "coordinate") {
            const [begin, end] = result.interval;
            await scale.zoomTo([begin, { chrom: end.chrom, pos: end.pos - 1 }]);
        } else {
            status.textContent =
                result.kind === "invalid-coordinate"
                    ? result.message
                    : "Enter a coordinate or a known contig name.";
        }
    });
window.addEventListener("pagehide", () => api.finalize(), { once: true });
