/**
 * Events that are broadcasted to all views.
 * @typedef {"dataFlowBuilt" | "layout" | "layoutComputed" | "subtreeDataReady"} BroadcastEventType
 */

import "./data/formats/parquet.js";
import "./data/formats/arrow.js";
import "./data/formats/bed.js";
import "./data/formats/bedpe.js";
import "./data/formats/fasta.js";
import "./data/formats/wig.js";
import "./data/formats/vcf.js";
// These side-effect imports make the default runtime fat for convenience.
import "./data/sources/lazy/registerBuiltInLazySources.js";
import "./rendering/registerCanvas.js";
import "./rendering/registerSvg.js";
import "./rendering/registerWebGL.js";

export { default } from "./genomeSpyBase.js";
