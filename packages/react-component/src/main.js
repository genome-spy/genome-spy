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
            try {
                const api = await embed(container, config);
                onEmbed(api);
                apiRef.current = api;
            } catch (e) {
                setError(e.toString());
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
