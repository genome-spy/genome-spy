import { Variant } from "@gmod/vcf";

type Samples = ReturnType<Variant["SAMPLES"]>;

export type ParsedVariant = Omit<Variant, "SAMPLES" | "GENOTYPES"> & {
    SAMPLES: Samples;
};
