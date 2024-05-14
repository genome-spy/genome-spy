import { RootSpec } from "@genome-spy/core/spec/root.js";
import { EmbedResult } from "@genome-spy/core/types/embedApi.js";

export interface IGenomeSpyProps {
    spec: RootSpec;
    onEmbed: (api: EmbedResult) => void;
}

export default function GenomeSpy(props: IGenomeSpyProps): JSX.Element;
