// Keep recording in its separate browser add-on. Named re-exports let the
// bundler exclude it while source consumers use the unified controls entrypoint.
export {
    attachControls,
    button,
    pngButton,
    svgButton,
    fullWindowButton,
    genomeSpyButton,
} from "../src/controls.js";
