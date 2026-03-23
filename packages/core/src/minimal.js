/**
 * Lean GenomeSpy core entry point.
 *
 * Use this entry when you want the `embed` API without the default built-in
 * eager and lazy format registrations. Import the optional data source and
 * format modules you need explicitly.
 */
import { html } from "lit";

// Lean core entry point: shares the embed API, but skips built-in optional
// eager and lazy format registrations.
import GenomeSpy from "./genomeSpyBase.js";
import icon from "./img/bowtie.svg";
import favIcon from "./img/genomespy-favicon.svg";
import { createEmbed, loadSpec } from "./embedFactory.js";

export { GenomeSpy, html, icon, favIcon };

export const embed = createEmbed(GenomeSpy);

export { loadSpec };
