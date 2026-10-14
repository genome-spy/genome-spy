import { useState, useEffect, useRef, createElement } from "react";
import { embed } from "@genome-spy/core/index.js";

/**
 * @param {{spec: import("@genome-spy/core/spec/root.js").RootSpec, onEmbed: (api: import("@genome-spy/core/types/embedApi.js").EmbedResult) => void}} props
 */
export default function GenomeSpy(props) {
    const { spec, onEmbed } = props;
    /** @type {import("react").MutableRefObject<HTMLDivElement>} */
    const containerRef = useRef(null);
    /** @type {import("react").MutableRefObject<import("@genome-spy/core/types/embedApi.js").EmbedResult | null>} */
    const apiRef = useRef(null);
    /** @type {ReturnType<typeof useState<string | undefined>>} */
    const [error, setError] = useState();

    useEffect(() => {
        /**
         * @param {HTMLDivElement} container
         * @param {import("@genome-spy/core/spec/root.js").RootSpec} config
         */
        async function embedInContainer(container, config) {
            // Core displays reported errors before rejecting; wrapper errors need fallback UI.
            /** @type {Set<unknown>} */
            const reportedErrors = new Set();
            try {
                const api = await embed(container, config, {
                    onError: (error) => {
                        reportedErrors.add(error);
                    },
                });
                apiRef.current = api;
                onEmbed(api);
            } catch (e) {
                if (!reportedErrors.has(e)) {
                    setError(String(e));
                }
            }
        }
        embedInContainer(containerRef.current, spec);
        return () => {
            apiRef.current?.finalize();
        };
    }, []);

    return createElement(
        "div",
        { className: "embed-container", ref: containerRef },
        error && createElement("pre", null, error)
    );
}
