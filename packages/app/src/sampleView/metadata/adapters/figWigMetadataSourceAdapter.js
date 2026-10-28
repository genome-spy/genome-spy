import { FigWig } from "@genome-spy/figwig";
import { resolveUrl } from "@genome-spy/core/utils/url.js";
import TableMetadataSourceAdapter from "./tableMetadataSourceAdapter.js";

export default class FigWigMetadataSourceAdapter extends TableMetadataSourceAdapter {
    /** @type {string} */
    #url;

    /**
     * @param {import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef} source
     * @param {{ baseUrl?: string }} [options]
     */
    constructor(source, options = {}) {
        super(source, {
            ...options,
            sampleIdField: "name",
            excludedColumns: ["dtype", "group", "sample"],
        });
        const backend =
            /** @type {import("@genome-spy/app/spec/sampleView.js").FigWigBackendDef} */
            (source.backend);
        this.#url = resolveUrl(options.baseUrl, backend.url);
    }

    /**
     * @param {AbortSignal} [signal]
     * @returns {Promise<Record<string, any>[]>}
     * @protected
     */
    async loadRows(signal) {
        const reader = new FigWig({ url: this.#url });
        try {
            const tracks = await reader.getTracks({ signal });
            return tracks.map((track) => {
                /** @type {Record<string, any>} */
                const row = { ...track.metadata, name: track.name };
                delete row.dtype;
                delete row.group;
                return row;
            });
        } finally {
            await reader.close();
        }
    }
}
