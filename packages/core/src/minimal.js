/**
 * Lean GenomeSpy core entry point.
 *
 * Use this entry when you want the `embed` API without the default built-in
 * optional eager and lazy format registrations. Core axis lazy sources remain
 * available.
 */
import { html } from "lit";

// Lean core entry point: shares the embed API, but skips optional eager and
// lazy format registrations.
import GenomeSpy from "./genomeSpyBase.js";
import icon from "./img/bowtie.svg";
import favIcon from "./img/genomespy-favicon.svg";
import { createEmbed, loadSpec } from "./embedFactory.js";
import "./data/sources/lazy/registerCoreLazySources.js";

export { GenomeSpy, html, icon, favIcon };

export const embed = createEmbed(GenomeSpy);

export { loadSpec };
