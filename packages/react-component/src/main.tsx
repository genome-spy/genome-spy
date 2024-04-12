import React, { forwardRef } from 'react'
import { embed } from "@genome-spy/core";

interface GenomeSpySpec {
    baseUrl?: readonly string;
    // TODO
}

interface GenomeSpyData {
    // TODO
}

function GenomeSpy ({spec: GenomeSpySpec, data: GenomeSpyData}, embedRef) {

    const [error, setError] = useState<string|undefined>()
    const getBaseUrl = (): string => 'TODO' // TODO: how to get base URL? 

    useEffect(() => {
        async function embedToDoc(container, conf) {
            const baseUrl = getBaseUrl();
            const dataBaseUrl = `${baseUrl}/data/`

            try {
                conf.baseUrl = conf.baseUrl || dataBaseUrl
                await embed(container, conf, { bare: true })
            } catch (e) {
                setError(e.toString()) 
            }
        }

        embedToDoc(embedRef.current, spec)

        return () => {
            // TODO: how to clean up?
        }
    }, [])

    return (
        <div class="embed-container" ref={embedRef}>
            {error && <pre>{error}</pre>}
        </div>
    )
}

export default forwardRef(GenomeSpy)
