
import formulaTransform from './formula';
import gatherTransform from './gather';
import regexMatchTransform from './regexMatch';
import simpleFilterTransform from './simpleFilter';
import flattenDelimitedTransform from './flattenDelimited';
import stackTransform from './stack';
import equalizeTransform from './equalize';

const transformers = {
    equalize: equalizeTransform,
    flattenDelimited: flattenDelimitedTransform,
    formula: formulaTransform,
    gather: gatherTransform,
    regexMatch: regexMatchTransform,
    simpleFilter: simpleFilterTransform,
    stack: stackTransform
};

export default transformers;