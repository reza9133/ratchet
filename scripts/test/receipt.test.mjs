import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReceipt, deployedAddress } from '../lib/receipt.mjs';

test('snake_case studio receipt with SUCCESS leader', () => {
  const c = classifyReceipt({ status_name: 'ACCEPTED', result_name: 'MAJORITY_AGREE',
    consensus_data: { leader_receipt: [{ mode: 'leader', execution_result: 'SUCCESS' }] } });
  assert.equal(c.ok, true); assert.equal(c.kind, 'OK'); assert.equal(c.finalized, false);
});
test('finalized, camelCase names', () => {
  const c = classifyReceipt({ statusName: 'FINALIZED', resultName: 'MAJORITY_AGREE', txExecutionResultName: 'FINISHED_WITH_RETURN' });
  assert.equal(c.ok, true); assert.equal(c.finalized, true);
});
test('execution error is a failure with its text', () => {
  const c = classifyReceipt({ status_name: 'ACCEPTED', result_name: 'MAJORITY_AGREE',
    consensus_data: { leader_receipt: [{ mode: 'leader', execution_result: 'ERROR',
      result: { payload: { readable: "UserError(message='members only')" } } }] } });
  assert.equal(c.ok, false); assert.equal(c.kind, 'EXEC_ERROR'); assert.match(c.errorText, /members only/);
});
test('undetermined and disagreement are never ok', () => {
  assert.equal(classifyReceipt({ status_name: 'UNDETERMINED' }).kind, 'UNDETERMINED');
  assert.equal(classifyReceipt({ status_name: 'ACCEPTED', result_name: 'MAJORITY_DISAGREE' }).kind, 'UNDETERMINED');
  assert.equal(classifyReceipt({ status_name: 'ACCEPTED', result_name: 'NO_MAJORITY' }).ok, false);
});
test('pending / timeout / canceled', () => {
  assert.equal(classifyReceipt({ status_name: 'PROPOSING' }).kind, 'PENDING');
  assert.equal(classifyReceipt({ status_name: 'LEADER_TIMEOUT' }).kind, 'TIMEOUT');
  assert.equal(classifyReceipt({ status_name: 'CANCELED' }).kind, 'CANCELED');
});
test('numeric and PascalCase spellings', () => {
  assert.equal(classifyReceipt({ status: 7, result: 6, txExecutionResult: 1 }).ok, true);
  assert.equal(classifyReceipt({ status: 7, result: 6, txExecutionResult: 2 }).kind, 'EXEC_ERROR');
  assert.equal(classifyReceipt({ statusName: 'Finalized', resultName: 'MajorityAgree', txExecutionResultName: 'FinishedWithReturn' }).ok, true);
});
test('deployed address extraction', () => {
  const a = '0x' + 'ab'.repeat(20);
  assert.equal(deployedAddress({ data: { contract_address: a } }), a);
  assert.equal(deployedAddress({ to_address: a }), a);
  assert.equal(deployedAddress({ to_address: '0x' + '0'.repeat(40) }), null);
  assert.equal(deployedAddress({}), null);
});
