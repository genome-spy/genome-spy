import { renderingModules } from "./renderingModuleRegistry.js";

renderingModules.svgRenderer = () => import("./svg/index.js");
