
import gatherTransform from './gather';
import calculateTransform from './calculate';
import regexMatchTransform from './regexMatch';
import simpleFilterTransform from './simpleFilter';
import flattenDelimitedTransform from './flattenDelimited';

const transformers = {
    calculate: calculateTransform,
    flattenDelimited: flattenDelimitedTransform,
    gather: gatherTransform,
    regexMatch: regexMatchTransform,
    simpleFilter: simpleFilterTransform
};

export default transformers;