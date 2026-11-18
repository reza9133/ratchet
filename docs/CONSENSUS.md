# Consensus rule: exact equality, no tolerance

RATCHET asks GenLayer validators one question per transaction that involves the AI:

> For each charter article *other than the one the motion edits*: would adopting this
> motion amend, repeal, suspend, override or directly contradict it? (`true` / `false`)

The answers decide a **tier** (a level), the tier decides the **vote threshold**, and
the threshold, together with the challenge game, decides **who is paid what** and
**which state the contract moves to**. A wrong answer therefore moves money, so the
validators are held to the strictest possible standard.

## The rule

> Every value that is stored, changes a counter, or decides the path or payout of a
> motion (statuses, booleans, scores, levels) must be **exactly equal** between the
> leader and each approving validator. A difference of any size is a disagreement:
> not one level stricter, not one level looser, not one adjacent level, not one boolean.
> Flexible comparison is allowed **only** for free-text explanations.

There is no tolerance band anywhere in the contract. The pattern "accept the leader if
the validator's level is within one step" does **not** exist in this code base, and the
mutation suite proves its absence (see below).

## What is compared, and how

| Value | Kind | Stored? | Decides | Comparison between leader and validator |
|---|---|---|---|---|
| `touches[article_id]` for every article | boolean | yes (`motion.touches`, `motion.challenge.touches`) | the tier, therefore threshold, bounty, bond routing, counters | **exact**: the full map must be equal, key for key, bool for bool |
| `tier` (derived from the touches and the floor) | level 1..4 | yes (`motion.tier`) | vote threshold, `raised` flag, payouts | **exact**, and additionally recomputed from the booleans (`well_formed`) so a forged tier cannot ride on correct booleans |
| the set of keys | structure | yes | which articles exist for the motion | **exact**: no missing, no invented, no renamed article |
| booleans must be real booleans | type | yes | - | **strict**: `1`, `0`, `"true"`, `null` are rejected, not coerced |
| `reason` | free text | yes (display only) | nothing | **not compared**; only made safe (whitespace-collapsed, 400 chars max, never fails validation) |

Everything else the contract stores (votes, counters, bonds, deadlines) is computed by
ordinary deterministic code from the values above and from the transaction itself, so it
is identical on every node by construction.

## How a validator decides

`judge()` in `contracts/Ratchet.py` uses `gl.vm.run_nondet_unsafe(leader, validator)`:

1. **Leader** runs the assessment (one `exec_prompt` with `response_format="json"`), validates the
   JSON strictly, derives the tier in code, and returns `{touches, tier, reason}`.
2. **Validator**
   1. rejects anything that is not a successful leader return (a leader error is never approved);
   2. rejects a structurally invalid or internally inconsistent leader result
      (`well_formed`: exact key set, real booleans, integer tier, tier equals the tier derived from the booleans);
   3. runs its **own independent assessment** on the same frozen evidence. It never sees the
      leader's answer while forming its own, so there is no anchoring;
   4. approves only if `proposed.touches == mine.touches` **and** `proposed.tier == mine.tier`;
   5. any exception on the validator side is a vote against, never a crash and never an approval.
3. After consensus the contract re-validates the agreed result once more before touching storage.

If the validators do not agree, the transaction ends **UNDETERMINED** and changes nothing
(see `test_all_validators_disagreeing_on_any_single_article_rolls_back`). The caller may simply
send it again. The live end-to-end script does exactly that, at most twice, and it proves
that the failed attempt left the state untouched.

## Why booleans, and why a derived level

A single question "which tier is this motion?" invites validators to disagree by one step
on borderline cases, which is exactly what a tolerance rule would then paper over. RATCHET
instead asks several narrow yes/no questions with an operational definition and a
conservative default, then **computes** the level in code from the answers. The level is
never an LLM output, so it cannot be fudged, and equality of the booleans implies equality of
the level. The tier is compared anyway: belt and braces.

Two readings exist, because one prompt cannot be both cautious and complete:

* **STRICT** (first assessment): `true` only when the motion's own words clearly amend, repeal,
  suspend, override or contradict the article. Indirect or arguable conflicts are `false`.
* **INCLUSIVE** (a member's challenge): also `true` when the literal effect would in practice
  weaken, bypass or empty the article's rule. A challenge can only **add** touched articles; the
  tier ratchets up, never down. Both readings use the identical frozen evidence (digest-checked).

## Liveness trade-off

Exact equality means a borderline motion can fail to reach consensus. That is deliberate:
the safe failure mode is "nothing happened, try again", never "a coin flip moved the money".
The design reduces how often this happens without weakening the rule:

* the questions are binary, operationally defined and default to `false`;
* the evidence is frozen at filing (a SHA-256 digest is checked before every assessment) and the
  clerk never sees tiers, bonds or the leader's answer;
* the prompt contains a fixed output example with imaginary article ids;
* a charter without other articles needs no AI call at all.

## Evidence in the test-suite

| Claim | Test |
|---|---|
| agreement **iff** the boolean maps are equal, for all 16 x 16 leader/validator pairs | `test_every_pair_of_assessments_agrees_only_when_identical` |
| adjacent tiers (1 vs 2, 2 vs 3, 3 vs 4) are rejected in **both** directions | `test_adjacent_tier_difference_is_rejected_both_directions` |
| same tier but different booleans is still rejected | `test_same_tier_but_different_booleans_is_still_rejected` |
| only the free-text reason may differ (different, empty, or non-string) | `test_free_text_reason_is_the_only_thing_allowed_to_differ` |
| the validator never sees the leader's answer | `test_validator_assesses_independently_and_never_sees_the_leader_answer` |
| a leader error is never approved | `test_leader_error_is_never_approved` |
| 14 kinds of forged or malformed leader results are rejected | `test_forged_or_malformed_leader_results_are_rejected` |
| a forged tier cannot ride on equal booleans | `test_forged_leader_tier_cannot_ride_on_equal_booleans` |
| validator-side failures are votes against, not crashes | `test_validator_side_failures_vote_disagree_not_crash` |
| a single differing article, in any of the four positions, rolls the transaction back | `test_all_validators_disagreeing_on_any_single_article_rolls_back` |
| the challenge path obeys the same rule | `test_challenge_path_uses_the_same_exact_rule` |

### Mutation proof

`tests/mutation/run_mutations.py` breaks the contract in 48 places on purpose. The first group
weakens the validator: it re-introduces the old tolerance pattern (booleans ignored, tiers within
one step accepted), accepts leader errors, swallows validator failures, compares the free text
too, skips the structural check, or approves unconditionally. **Every one is killed by the
suite.** The single surviving mutant is a documented equivalent (dropping the validator's tier
comparison changes nothing observable because `well_formed` already enforces tier consistency;
the combined removal of both layers *is* killed).

`tests/mutation/e2e_selfcheck.py` then runs the live end-to-end script against ten broken
contracts and demands that it fails each time, so a green live report is meaningful.
