import { html } from "lit";

// Default core entry point: imports the fat GenomeSpy runtime with built-in
// eager and lazy format registrations.
import GenomeSpy from "./genomeSpy.js";
import bowtieSvg from "./img/bowtie.svg";
import faviconSvg from "./img/genomespy-favicon.svg";
import { createEmbed, loadSpec } from "./embedFactory.js";

export { GenomeSpy, html };
export const icon = bowtieSvg;
export const favIcon = faviconSvg;

export const embed = createEmbed(GenomeSpy);

export { loadSpec };
export { intervalSelection } from "./selection/index.js";

export { getSpecErrorLocation } from "./utils/specError.js";
