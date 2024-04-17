import { useState, useEffect, useRef } from 'react'
import { embed } from "@genome-spy/core";
import type { ViewSpecBase, RootSpec } from "@genome-spy/core"
import { EmbedResult } from '@genome-spy/core/types/embedApi.js';

interface IGenomeSpyProps {
    spec: ViewSpecBase;
    onEmbed: (api: Promise<EmbedResult>) => void; 
}

export default function GenomeSpy ({ spec, onEmbed }: IGenomeSpyProps) {
    const embedRef = useRef<HTMLDivElement>(null)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        async function embedToDoc(container: HTMLDivElement | null, config: RootSpec) {
            try {
               const api = await embed(container, config, { bare: true })
               onEmbed(api)
            } catch (e) {
                setError(e!.toString()) 
            }
        }
        embedToDoc(embedRef.current, spec)
    }, [])

    return (
        <div className="embed-container" ref={embedRef}>
            {error && <pre>{error}</pre>}
        </div>
    )
}