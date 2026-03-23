import { html } from "lit";

import GenomeSpy from "./genomeSpyBase.js";
import icon from "./img/bowtie.svg";
import favIcon from "./img/genomespy-favicon.svg";
import { createEmbed, loadSpec } from "./embedFactory.js";

export { GenomeSpy, html, icon, favIcon };

export const embed = createEmbed(GenomeSpy);

export { loadSpec };
