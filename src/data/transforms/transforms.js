
import formulaTransform from './formula';
import gatherTransform from './gather';
import regexMatchTransform from './regexMatch';
import simpleFilterTransform from './simpleFilter';
import flattenDelimitedTransform from './flattenDelimited';
import stackTransform from './stack';

const transformers = {
    flattenDelimited: flattenDelimitedTransform,
    formula: formulaTransform,
    gather: gatherTransform,
    regexMatch: regexMatchTransform,
    simpleFilter: simpleFilterTransform,
    stack: stackTransform
};

export default transformers;