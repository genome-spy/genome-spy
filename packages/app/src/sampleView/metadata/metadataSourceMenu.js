import { html } from "lit";
import { faDatabase } from "@fortawesome/free-solid-svg-icons";
import { showMessageDialog } from "../../components/generic/messageDialog.js";
import { showImportMetadataFromSourceDialog } from "./importMetadataFromSourceDialog.js";
import { resolveMetadataSources } from "./metadataSourceAdapters.js";
import { getEffectiveInitialLoad } from "./metadataSourceInitialLoad.js";

/**
 * @typedef {{
 *   source: import("@genome-spy/app/spec/sampleView.js").MetadataSourceDef;
 *   label: string;
 * }} ImportableMetadataSource
 */

/**
 * Builds the metadata-source import menu item and encapsulates source loading.
 */
export class MetadataSourceMenuController {
    /** @type {ImportableMetadataSource[] | null} */
    #cachedSources = null;

    /** @type {Promise<ImportableMetadataSource[]> | null} */
    #cachedSourcesPromise = null;

    /** @type {import("../sampleView.js").default | null} */
    #cachedSampleView = null;

    /**
     * @param {import("../sampleView.js").default | null} sampleView
     * @param {import("../../state/intentPipeline.js").default | null} intentPipeline
     * @returns {Promise<import("../../utils/ui/contextMenu.js").MenuItem | undefined>}
     */
    async createImportMenuItem(sampleView, intentPipeline) {
        if (!sampleView || !intentPipeline) {
            return undefined;
        }

        /** @type {ImportableMetadataSource[]} */
        let importableSources = [];
        try {
            importableSources = await this.#getImportableSources(sampleView);
        } catch (error) {
            showMessageDialog(
                "Could not load metadata sources: " + String(error),
                {
                    title: "Warning",
                    type: "warning",
                }
            );
            return undefined;
        }

        if (importableSources.length === 0) {
            return undefined;
        }

        if (importableSources.length === 1) {
            const source = importableSources[0];
            return {
                label: html`Import metadata from
                    <em>${source.label}</em> source`,
                icon: faDatabase,
                callback: () =>
                    showImportMetadataFromSourceDialog(
                        sampleView,
                        intentPipeline,
                        source.source
                    ),
            };
        } else {
            return {
                label: "Import metadata from source",
                icon: faDatabase,
                submenu: importableSources.map((source) => ({
                    label: source.label,
                    callback: () => {
                        if (!source.source.id) {
                            showMessageDialog(
                                'Metadata source "' +
                                    source.label +
                                    '" is missing "id". Source ids are required when multiple metadata sources are configured.',
                                {
                                    title: "Warning",
                                    type: "warning",
                                }
                            );
                            return;
                        }

                        showImportMetadataFromSourceDialog(
                            sampleView,
                            intentPipeline,
                            source.source
                        );
                    },
                })),
            };
        }
    }

    /**
     * @param {import("../sampleView.js").default} sampleView
     * @returns {Promise<ImportableMetadataSource[]>}
     */
    async #getImportableSources(sampleView) {
        if (
            this.#cachedSampleView === sampleView &&
            this.#cachedSources !== null
        ) {
            return this.#cachedSources;
        }

        if (this.#cachedSourcesPromise) {
            return this.#cachedSourcesPromise;
        }

        this.#cachedSourcesPromise = (async () => {
            const sources = await resolveMetadataSources(
                sampleView.spec.samples,
                {
                    baseUrl: sampleView.getBaseUrl(),
                }
            );

            const importableSources = sources
                .filter(
                    (source) =>
                        !(
                            source.backend.backend === "data" &&
                            getEffectiveInitialLoad(source) === "*"
                        )
                )
                .map((source, index) => ({
                    source,
                    label:
                        source.name ??
                        source.id ??
                        "Source " + String(index + 1),
                }));

            this.#cachedSampleView = sampleView;
            this.#cachedSources = importableSources;
            return importableSources;
        })();

        try {
            return await this.#cachedSourcesPromise;
        } finally {
            this.#cachedSourcesPromise = null;
        }
    }
}
