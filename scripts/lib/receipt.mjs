// Normalises the several receipt shapes genlayer-js 1.1.8 / Studionet can produce
// (names vs numbers, camelCase vs snake_case, SDK vs raw-node spellings) into one
// small, predictable object.  Pure functions: unit-tested in scripts/test/receipt.test.mjs.

const STATUS_BY_NUMBER = {
  0: 'UNINITIALIZED', 1: 'PENDING', 2: 'PROPOSING', 3: 'COMMITTING', 4: 'REVEALING', 5: 'ACCEPTED',
  6: 'UNDETERMINED', 7: 'FINALIZED', 8: 'CANCELED', 9: 'APPEAL_REVEALING', 10: 'APPEAL_COMMITTING',
  11: 'READY_TO_FINALIZE', 12: 'VALIDATORS_TIMEOUT', 13: 'LEADER_TIMEOUT',
};
const RESULT_BY_NUMBER = {
  0: 'IDLE', 1: 'AGREE', 2: 'DISAGREE', 3: 'TIMEOUT', 4: 'DETERMINISTIC_VIOLATION', 5: 'NO_MAJORITY',
  6: 'MAJORITY_AGREE', 7: 'MAJORITY_DISAGREE',
};
const EXECUTION_BY_NUMBER = { 0: 'NOT_VOTED', 1: 'RETURN', 2: 'ERROR' };

function canonical(value, byNumber) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) return byNumber[String(value)];
  return String(value).replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toUpperCase();
}

function execution(value) {
  const name = canonical(value, EXECUTION_BY_NUMBER);
  if (!name) return undefined;
  if (['SUCCESS', 'FINISHED_WITH_RETURN', 'RETURN'].includes(name)) return 'RETURN';
  if (['ERROR', 'FINISHED_WITH_ERROR', 'FAILED', 'FAILURE'].includes(name)) return 'ERROR';
  return name;
}

function collectStrings(value, out = [], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return out;
  if (typeof value === 'string') { out.push(value); return out; }
  if (Array.isArray(value)) { value.forEach((v) => collectStrings(v, out, depth + 1)); return out; }
  if (typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out, depth + 1));
  return out;
}

export function leaderOf(receipt) {
  const data = receipt?.consensus_data ?? receipt?.consensusData ?? {};
  const raw = data.leader_receipt ?? data.leaderReceipt ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.find((l) => l?.mode === 'leader') ?? list[0] ?? null;
}

export function classifyReceipt(receipt) {
  const status = canonical(receipt?.statusName ?? receipt?.status_name ?? receipt?.status, STATUS_BY_NUMBER);
  const result = canonical(receipt?.resultName ?? receipt?.result_name ?? receipt?.result, RESULT_BY_NUMBER);
  const leader = leaderOf(receipt);
  const exec = execution(
    receipt?.txExecutionResultName ?? receipt?.tx_execution_result_name
    ?? receipt?.txExecutionResult ?? receipt?.tx_execution_result
    ?? leader?.execution_result ?? leader?.executionResult);
  const text = collectStrings(leader?.result).join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  const decided = status === 'ACCEPTED' || status === 'FINALIZED';
  const agreed = result === undefined || result === 'AGREE' || result === 'MAJORITY_AGREE';
  let kind = 'OK';
  if (!decided) {
    kind = status === 'UNDETERMINED' ? 'UNDETERMINED'
      : ['CANCELED'].includes(status) ? 'CANCELED'
      : ['LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT'].includes(status) ? 'TIMEOUT' : 'PENDING';
  } else if (!agreed) {
    kind = 'UNDETERMINED';
  } else if (exec === 'ERROR') {
    kind = 'EXEC_ERROR';
  }
  return {
    ok: kind === 'OK', kind, status, result, execution: exec, errorText: exec === 'ERROR' ? text : '',
    finalized: status === 'FINALIZED',
  };
}

export function deployedAddress(receipt) {
  const candidates = [receipt?.data?.contract_address, receipt?.data?.contractAddress,
    receipt?.to_address, receipt?.toAddress, receipt?.recipient];
  return candidates.find((c) => typeof c === 'string' && /^0x[0-9a-fA-F]{40}$/.test(c)
    && !/^0x0{40}$/.test(c)) ?? null;
}
