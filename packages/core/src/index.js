import { html } from "lit";

// Default core entry point: imports the fat GenomeSpy runtime with built-in
// eager and lazy format registrations.
import GenomeSpy from "./genomeSpy.js";
import icon from "./img/bowtie.svg";
import favIcon from "./img/genomespy-favicon.svg";
import { createEmbed, loadSpec } from "./embedFactory.js";

export { GenomeSpy, html, icon, favIcon };

export const embed = createEmbed(GenomeSpy);

export { loadSpec };
