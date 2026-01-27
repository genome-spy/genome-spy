import { boxplotStats } from "../utils/statistics/boxplot.js";

export type Scalar = import("@genome-spy/core/spec/channel.js").Scalar;

export type BoxplotStatistics = NonNullable<
    ReturnType<typeof boxplotStats>["statistics"]
>;

export type BoxplotStatsRow = BoxplotStatistics & Record<string, Scalar>;

export type BoxplotOutlierRow = Record<string, any>;

export type BoxplotFieldKey = "groupField" | "valueField" | "sampleField";

export type BoxplotFieldNames = Record<BoxplotFieldKey, string>;
