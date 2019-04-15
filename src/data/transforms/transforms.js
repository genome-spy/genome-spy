
import gatherTransform from './gather';
import calculateTransform from './calculate';
import regexMatchTransform from './regexMatch';
import simpleFilterTransform from './simpleFilter';

const transformers = {
    calculate: calculateTransform,
    gather: gatherTransform,
    regexMatch: regexMatchTransform,
    simpleFilter: simpleFilterTransform
};

export default transformers;