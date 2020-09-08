import coverage from "./coverage";
import formula from "./formula";
import gather from "./gather";
import regexExtract from "./regexExtract";
import simpleFilter from "./simpleFilter";
import filter from "./filter";
import flattenDelimited from "./flattenDelimited";
import sort from "./sort";
import stack from "./stack";
import pileup from "./pileup";

const transforms = {
    coverage,
    filter,
    flattenDelimited,
    formula,
    gather,
    pileup,
    regexExtract,
    simpleFilter,
    sort,
    stack
};

export default transforms;
