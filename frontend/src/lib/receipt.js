// Normalises the several receipt shapes genlayer-js 1.1.8 / Studionet can produce
// (port of scripts/lib/receipt.mjs of the contract repo).
const STATUS_BY_NUMBER = { 0: 'UNINITIALIZED', 1: 'PENDING', 2: 'PROPOSING', 3: 'COMMITTING', 4: 'REVEALING', 5: 'ACCEPTED',
  6: 'UNDETERMINED', 7: 'FINALIZED', 8: 'CANCELED', 9: 'APPEAL_REVEALING', 10: 'APPEAL_COMMITTING', 11: 'READY_TO_FINALIZE',
  12: 'VALIDATORS_TIMEOUT', 13: 'LEADER_TIMEOUT' };
const RESULT_BY_NUMBER = { 0: 'IDLE', 1: 'AGREE', 2: 'DISAGREE', 3: 'TIMEOUT', 4: 'DETERMINISTIC_VIOLATION', 5: 'NO_MAJORITY',
  6: 'MAJORITY_AGREE', 7: 'MAJORITY_DISAGREE' };
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
export const statusOf = (r) => canonical(r?.statusName ?? r?.status_name ?? r?.status, STATUS_BY_NUMBER);

export function classifyReceipt(receipt) {
  const status = statusOf(receipt);
  const result = canonical(receipt?.resultName ?? receipt?.result_name ?? receipt?.result, RESULT_BY_NUMBER);
  const leader = leaderOf(receipt);
  const exec = execution(receipt?.txExecutionResultName ?? receipt?.tx_execution_result_name
    ?? receipt?.txExecutionResult ?? receipt?.tx_execution_result ?? leader?.execution_result ?? leader?.executionResult);
  const text = collectStrings(leader?.result).join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  const decided = status === 'ACCEPTED' || status === 'FINALIZED';
  const agreed = result === undefined || result === 'AGREE' || result === 'MAJORITY_AGREE';
  let kind = 'OK';
  if (!decided) {
    kind = status === 'UNDETERMINED' ? 'UNDETERMINED' : status === 'CANCELED' ? 'CANCELED'
      : ['LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT'].includes(status) ? 'TIMEOUT' : 'PENDING';
  } else if (!agreed) kind = 'UNDETERMINED';
  else if (exec === 'ERROR') kind = 'EXEC_ERROR';
  return { ok: kind === 'OK', kind, status, result, execution: exec, errorText: exec === 'ERROR' ? text : '', finalized: status === 'FINALIZED' };
}

/** Human message for a contract revert text (the contract raises plain UserError strings). */
export function friendlyError(text) {
  const t = String(text || '');
  const map = [
    [/members only/i, 'Only members of the assembly can do this.'],
    [/floor is held/i, 'Another motion is on the floor. Only one motion can be active at a time.'],
    [/attach exactly the bond/i, 'The bond must be attached exactly (no more, no less).'],
    [/not on the frozen roster/i, 'You were not on the roster when this motion was filed.'],
    [/already voted/i, 'You have already voted on this motion.'],
    [/voting deadline passed/i, 'The voting deadline has passed.'],
    [/voting is still open/i, 'Voting is still open: wait for the deadline, or until everyone has voted.'],
    [/contest window still open/i, 'The challenge window is still open.'],
    [/contest window closed/i, 'The challenge window has closed.'],
    [/proposer cannot challenge/i, 'The proposer cannot challenge their own motion.'],
    [/already challenged/i, 'This motion has already been challenged once.'],
    [/not stale yet/i, 'The motion is not stale yet.'],
    [/nothing to withdraw/i, 'You have nothing to withdraw.'],
    [/amendment changes nothing/i, 'That amendment changes nothing.'],
    [/charter is full/i, 'The charter already holds the maximum number of articles.'],
  ];
  for (const [re, msg] of map) if (re.test(t)) return msg;
  return t || 'The transaction was rejected by the contract.';
}
