/**
 * Events that are broadcasted to all views.
 * @typedef {"dataFlowBuilt" | "layout" | "layoutComputed" | "subtreeDataReady"} BroadcastEventType
 */

import "./data/formats/parquet.js";
import "./data/formats/bed.js";
import "./data/formats/bedpe.js";
import "./data/formats/fasta.js";
import "./data/sources/lazy/registerBuiltInLazySources.js";

export { default } from "./genomeSpyBase.js";
