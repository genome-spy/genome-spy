import { useState, useEffect, useRef } from 'react'
import { embed } from "@genome-spy/core";
import type { ViewSpecBase, RootSpec } from "@genome-spy/core"
import { EmbedResult } from '@genome-spy/core/types/embedApi.js';

interface IGenomeSpyProps {
    spec: ViewSpecBase;
    onEmbed: (api: EmbedResult) => void; 
}

export default function GenomeSpy ({ spec, onEmbed }: IGenomeSpyProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const apiRef = useRef<EmbedResult|null>(null)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        async function embedInContainer(container: HTMLDivElement | null, config: RootSpec) {
            try {
               const api: EmbedResult = await embed(container, config, { bare: true })
               onEmbed(api)
               apiRef.current = api
            } catch (e) {
                setError(e!.toString()) 
            }
        }
        embedInContainer(containerRef.current, spec)
        return  () => {
            apiRef.current?.finalize()
        }
    }, [])

    return (
        <div className="embed-container" ref={containerRef}>
            {error && <pre>{error}</pre>}
        </div>
    )
}