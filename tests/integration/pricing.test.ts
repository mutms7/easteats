import {it,expect} from 'vitest';
import {modelCost,assertPricedModel} from '@/server/pricing';
it('charges the actual model rate',()=>{expect(modelCost({model:'claude-sonnet-5-5',inputTokens:1000,outputTokens:100})).toBeCloseTo(.003);expect(modelCost({model:'claude-sonnet-4-6',inputTokens:1000,outputTokens:100})).toBeCloseTo(.0045);});
it('refuses an unpriced override before spending',()=>expect(()=>assertPricedModel('unknown-model')).toThrow());
it('accounts for the Haiku long-input tier',()=>expect(modelCost({model:'claude-haiku-5-5',inputTokens:100001,outputTokens:1000})).toBeCloseTo(.0525005));
