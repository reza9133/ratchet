# RATCHET live end-to-end report

* mode: **live**   * network: https://studio.genlayer.com/api
* contract: `0xA0a4fB98Da65a8e43B7b8bccb8431FEebEd0AEEe`
* source sha256: `b7618b552d782c1bcb16ecfd98e87e2363c3c7e3f9facb287061ddeb7fed332a`
* started: 2026-11-21T08:17:53.220Z   * duration: 2584 s
* **260 passed, 0 failed, 1 warnings** (261 checks, 73 transactions)

## Setup: accounts, funding, deployment

- ✔ F0 0x217588cb7eff5c61b1965bbed8b0779262bd4606 holds 0.22 GEN (already funded)
- ✔ F1 0x5e03aecc7aa70c333982badede3498ea52630289 holds 0.122 GEN (already funded)
- ✔ F2 0xbf418943b95cd2e463b674ead56714b65cd4a0e3 holds 0.098 GEN (already funded)
- ✔ F3 0x478940f07f5bbbb83aec9e69876717dcf97f28ee holds 0.13 GEN (already funded)
- ✔ F4 0xd084047b2fc3b05bfc693c1b0b29fcc8f5fa33f3 holds 0.126 GEN (already funded)
- ✔ O 0x8b76b91c73a9818fe6236f6d4210a6a9a5c1bab2 holds 0.126 GEN (already funded)
- ✔ G 0x787f3ad650ab9bfb012d28841b83f9136e4f4662 holds 0.131 GEN (already funded)
- ✔ deployment accepted
- ✔ deployed contract address found in the receipt
- ✔ deployed source is byte-identical to contracts/Ratchet.py
- · contract 0xA0a4fB98Da65a8e43B7b8bccb8431FEebEd0AEEe

| tx | result | hash | s |
|---|---|---|---|
| F0.deploy | ok | `0xf86ead555752edc542c735dd7e48663debd081afeca73e1a7670343cf407eeb2` | 15 |

## S0  Baseline reads

- ✔ name, bond and windows were stored
- ✔ roster equals the five founders
- ✔ four articles, no motions, floor free
- ✔ charter tiers are 1,4,3,2 for A1..A4
- ✔ threshold ladder for 5 members is 3,4,4,5
- ✔ baseline: contract is solvent (balance >= books)
- ✔ baseline: ledger balance equals the chain balance
- ✔ baseline: pull-payment total equals the sum of member balances

## S1  Guards (each of these transactions must revert and move no money)

- ✔ file_amendment by O reverts
- ✔   revert reason mentions "members only"
- ✔ file_amendment by F1 reverts
- ✔   revert reason mentions "attach exactly the bond"
- ✔ file_amendment by F1 reverts
- ✔   revert reason mentions "article id must be"
- ✔ classify by F2 reverts
- ✔   revert reason mentions "motion not found"
- ✔ no motion was created by the failed attempts
- ⚠ failed transactions did not leave value in the contract — contract holds 12000000000000001 wei
- ✔ every wei left by failed transactions was attributed to its sender
- · Studionet kept 4000000000000000 wei of the reverted O.file_amendment; charged to O in the final conservation check
- · Studionet kept 4000000000000001 wei of the reverted F1.file_amendment; charged to F1 in the final conservation check
- · Studionet kept 4000000000000000 wei of the reverted F1.file_amendment; charged to F1 in the final conservation check

| tx | result | hash | s |
|---|---|---|---|
| O.file_amendment (must revert) | EXEC_ERROR | `0x28b05343d8e16abadc78000df6e6d79fbbc951d83e81df3cf17e53c7babc86a5` | 15 |
| F1.file_amendment (must revert) | EXEC_ERROR | `0x3c7edcef6048848917127615d767a1f24a3b4cf1777b5470da89603916f28498` | 15 |
| F1.file_amendment (must revert) | EXEC_ERROR | `0xf5ca788bfc882aa43b4774f3d0845abff536d77db49eecb90604a30adb45f847` | 15 |
| F2.classify (must revert) | EXEC_ERROR | `0x3d00614f2a81c19a93f4472826f2235e51fe29d2f633e8d0419498f916cc3e7d` | 30 |

## S2  Treasury donation and bond withdrawal

- ✔ donation accepted
- ✔ treasury holds the donation
- ✔ F1 files a motion
- ✔ motion 1 is FILED with a frozen five-member roster and four-article snapshot
- ✔ F1 withdraws it before classification
- ✔ motion 1 is WITHDRAWN and its bond is claimable
- ✔ the floor is free again
- ✔ after S2: contract is solvent (balance >= books)
- ✔ after S2: ledger balance equals the chain balance
- ✔ after S2: pull-payment total equals the sum of member balances

| tx | result | hash | s |
|---|---|---|---|
| F2.donate | ok | `0xb6382452de12c98246a46e15b5e11d5add0a2f469bc5ea9ccbdb174caffba8e9` | 30 |
| F1.file_amendment | ok | `0x9c90c6fe012de24ba1c12e235ae814909e1fef8485ad090ab19de355e0af75b4` | 14 |
| F1.withdraw_motion | ok | `0xc1b4be47265e9d0eccb25910683eba574e879cf39f68dc1f2497ab5357e15e52` | 29 |

## S3  Happy path: adopt an article (AI strict reading, unanimous vote)

- ✔ F1 files the adoption
- ✔ F2 classifies (validators must reproduce the booleans exactly)
- ✔ motion is VOTING
- ✔ vote window is exactly the configured two minutes
- ✔ S3: stored touches cover exactly the other articles
- ✔ S3: every stored touch is a real boolean
- ✔ S3: tier = max(floor, touched tiers) = 1
- ✔ S3: reason is stored as free text
- ✔ AI expectation: an unrelated archive article touches nothing (tier 1)
- ✔ F0 vote accepted
- ✔ F1 vote accepted
- ✔ F2 vote accepted
- ✔ F3 vote accepted
- ✔ F4 vote accepted
- ✔ close_vote (everyone voted)
- ✔ motion is CONTESTABLE with a two-minute challenge window
- ✔ finalize after the window
- ✔ motion is ENACTED
- ✔ ARCHIVE is in the charter and the version advanced
- ✔ both of F1's bonds are claimable (2 x bond)
- ✔ after S3: contract is solvent (balance >= books)
- ✔ after S3: ledger balance equals the chain balance
- ✔ after S3: pull-payment total equals the sum of member balances
- ✔ F1 payout: ledger owes exactly 0.008 GEN
- ✔ F1 payout: withdraw accepted
- ✔ F1 payout: ledger zeroed immediately
- ✔ F1 payout: withdraw transaction finalized
- ✔ F1 payout: payout arrived (0.008 GEN)
- ✔ after F1 payout: contract is solvent (balance >= books)
- ✔ after F1 payout: ledger balance equals the chain balance
- ✔ after F1 payout: pull-payment total equals the sum of member balances
- ✔ after F1 payout: books fully settled (balance == treasury + escrow + claimable)
- · AI (strict) touched [] -> tier 1
- · waiting for chain time 1795249628 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F1.file_amendment | ok | `0x499c88d3826e969651c41884cd8dc2f31a7e6329adffef5b499c5a267022abea` | 14 |
| F2.classify | ok | `0x0504f5960a10fe826edaef24808536aec1dd05c0b2e07b63367880a1993ba46f` | 29 |
| F0.vote(yes) | ok | `0x3adcf9ca5c7599683e35b9c147dc326c881a08cc41434c35957d3394acc5006c` | 64 |
| F1.vote(yes) | ok | `0x20f009344e70617a315c4995356e829731200171d0bff41a17ef253e66602d21` | 66 |
| F2.vote(yes) | ok | `0x11a0db4050c02fbe4551067114f6c81cb53ddd467ad7a9f32dfaad8884d2b0cf` | 69 |
| F3.vote(yes) | ok | `0x96b00ff76fe1a154ed8a9db000c31e5b98fe4eb58c9b3f2e7793f33af829f47c` | 71 |
| F4.vote(yes) | ok | `0x727411a4f8a065ef8a29a51afbf6e7e1960b2cd61fab06668ed48aaaae703853` | 74 |
| F3.close_vote | ok | `0x609246102e124e223be722921600ac3d4b11c8f89788cbf5d57271eec9380e0f` | 15 |
| F4.finalize | ok | `0x123305fc8ea20fab1f4c30283774a7a4a9ae136397c54e7ef4071488b50aa2dd` | 13 |
| F1.withdraw | ok | `0xde26aa47ed98dbaf22e6d410a7e4f8c2ff3dc013f99ce7e58935a8ca7d325184` | 29 |

## S4  Threshold boundary with an AI-derived tier

- ✔ F2 files a replacement of A1 that names A3
- ✔ F3 classifies
- ✔ S4: stored touches cover exactly the other articles
- ✔ S4: every stored touch is a real boolean
- ✔ S4: tier = max(floor, touched tiers) = 3
- ✔ S4: reason is stored as free text
- ✔ AI expectation: the strict reading flags the explicitly suspended A3 (tier 3)
- ✔ stored votes_needed equals the on-chain threshold for tier 3 (4)
- ✔ F0 vote accepted
- ✔ F1 vote accepted
- ✔ F2 vote accepted
- ✔ F3 vote accepted
- ✔ F4 vote accepted
- ✔ close_vote
- ✔ 3 yes votes are one short of 4: the motion is REJECTED
- ✔ a rejected motion returns the proposer's bond
- ✔ the charter is unchanged
- ✔ after S4: contract is solvent (balance >= books)
- ✔ after S4: ledger balance equals the chain balance
- ✔ after S4: pull-payment total equals the sum of member balances
- · AI (strict) touched [A3] -> tier 3

| tx | result | hash | s |
|---|---|---|---|
| F2.file_amendment | ok | `0x54a180d32746320368c9bfa97c1dbd87da9da9ef668d79e57789a0996143d69a` | 14 |
| F3.classify | ok | `0x185c205b7728e98da8636411f7945cbb07be357040c583e997ce0e9e2f3e8245` | 29 |
| F0.vote(yes) | ok | `0x935529d72deb48fff7da49392ce43ef0d5c4309d88c3fc72970d26c76fb53f61` | 64 |
| F1.vote(yes) | ok | `0x9c2b5d89957be0ce2c0a7748dcf5a7dedc23ae02e3a417973ed56e2796fba9a4` | 67 |
| F2.vote(yes) | ok | `0x88463fe76d81cfb6c9a7b16427bbbf4cf6e560fba88e4f13a71652fbc4252264` | 69 |
| F3.vote(no) | ok | `0xcfaea2e42a24326a63a0f68ee63fd11c00e0419643eaa131937be6a8a550e6a9` | 71 |
| F4.vote(no) | ok | `0x99ad70be61aae79b238c994b67a0a398356dab49c155da01d389b7a4d85fdf13` | 74 |
| F0.close_vote | ok | `0x2812decaa5586fb6fa0fd6bde975a59a1784eec127ec2232528f38baed851b17` | 30 |

## S5  The ratchet: challenging a strict reading (stealth motion)

- ✔ F1 files "TREASURER"
- ✔ F2 classifies (STRICT reading)
- ✔ S5 initial: stored touches cover exactly the other articles
- ✔ S5 initial: every stored touch is a real boolean
- ✔ S5 initial: tier = max(floor, touched tiers) = 3
- ✔ S5 initial: reason is stored as free text
- ✔ F0 vote accepted
- ✔ F1 vote accepted
- ✔ F2 vote accepted
- ✔ F3 vote accepted
- ✔ F4 vote accepted
- ✔ close_vote
- ✔ S5: motion ended consistently with its tier
- ✔ after S5: contract is solvent (balance >= books)
- ✔ after S5: ledger balance equals the chain balance
- ✔ after S5: pull-payment total equals the sum of member balances
- · AI (strict) touched [A3] -> tier 3
- · S5: the strict reading already required tier 3; the motion ended REJECTED and the challenge path is not exercised here

| tx | result | hash | s |
|---|---|---|---|
| F1.file_amendment | ok | `0xcccac40455ce6d3c8b3a59503f5c13d9bd45d606ba0e30e9c375f52d0e494491` | 14 |
| F2.classify | ok | `0x35717c3a70af342bd584024ee68098bd8308f2aa2a2bf16a037838cbc14dc31f` | 29 |
| F0.vote(yes) | ok | `0xfb829c0cc02cbe729297cb17eedd4fe47b94201a897359f0999049092a77c9d5` | 64 |
| F1.vote(yes) | ok | `0xaf1cbd386de8fb4cd5f064bb157bd42a3c70f57e8aff653663464ef2e1ac9f65` | 67 |
| F2.vote(yes) | ok | `0x6464990f146f16bb6a924a8e469983c4febc93680c8883f096188267e2f997b6` | 69 |
| F3.vote(no) | ok | `0x3726cc5ceea7bb67a9253ca45492c4e1c98e291a31ecdfebe6baba6651495708` | 71 |
| F4.vote(no) | ok | `0x5b835230318a2fe6dd3c09b63268a1777f59ab1d251e97f40b7b9a3b557a1864` | 74 |
| F2.close_vote | ok | `0xd654507a00bb11d9601c9dd54585f723c96459614d4f15e69e4a6075c9a2a759` | 30 |

## S5b  A challenge that fails: the challenger forfeits half the bond

- ✔ F2 files "ALBUM"
- ✔ F3 classifies (STRICT reading)
- ✔ S5b initial: stored touches cover exactly the other articles
- ✔ S5b initial: every stored touch is a real boolean
- ✔ S5b initial: tier = max(floor, touched tiers) = 1
- ✔ S5b initial: reason is stored as free text
- ✔ F0 vote accepted
- ✔ F1 vote accepted
- ✔ F2 vote accepted
- ✔ F3 vote accepted
- ✔ F4 vote accepted
- ✔ close_vote
- ✔ F4 challenges (INCLUSIVE reading, bond attached)
- ✔ S5b: exactly one challenge is recorded, by the challenger
- ✔ S5b after challenge: stored touches cover exactly the other articles
- ✔ S5b after challenge: every stored touch is a real boolean
- ✔ S5b after challenge: tier = max(floor, touched tiers) = 1
- ✔ S5b after challenge: reason is stored as free text
- ✔ AI expectation: an unrelated photo album touches no article under either reading
- ✔ S5b ratchet: no article that was touched before became untouched
- ✔ S5b ratchet: the tier never went down
- ✔ S5b: raised flag equals (tier after > tier before)
- ✔ S5b upheld: the proposer is compensated with half the challenger bond
- ✔ S5b upheld: the other half goes to the commons
- ✔ S5b upheld: the challenger is not refunded
- ✔ S5b after challenge: contract is solvent (balance >= books)
- ✔ S5b after challenge: ledger balance equals the chain balance
- ✔ S5b after challenge: pull-payment total equals the sum of member balances
- ✔ finalize right after the challenge (no waiting)
- ✔ S5b: 4 yes votes vs 3 needed at tier 1: motion is ENACTED
- ✔ S5b: proposer bond routing after settlement
- ✔ after S5b: contract is solvent (balance >= books)
- ✔ after S5b: ledger balance equals the chain balance
- ✔ after S5b: pull-payment total equals the sum of member balances
- · AI (strict) touched [] -> tier 1
- · AI (inclusive) touched []: tier 1 => 1; challenge was UPHELD (tier unchanged)
- · S5b challenge game: upheld, motion ENACTED

| tx | result | hash | s |
|---|---|---|---|
| F2.file_amendment | ok | `0x73c4a84256f83351bd82f368fb8a453f7894704e414df01c744712c6f0cfff03` | 14 |
| F3.classify | ok | `0x2d5555f77fed10b9cb6d167925274d03346d7310b778c636d0fb4ca38be11a70` | 29 |
| F0.vote(yes) | ok | `0xc69fb9860d4d42de1cd8e1028cc5b78e24232502ed0d04934ee33e809244ede6` | 64 |
| F1.vote(yes) | ok | `0x618ac9205929deb3bbba7b893009606ae92b86b99e8d6c4dadb076ca13bd3049` | 66 |
| F2.vote(yes) | ok | `0xfbfc02ce4f090f56fa64d28aba9f608ada54f337bb115e9a571b41c07649be9d` | 69 |
| F3.vote(yes) | ok | `0x3dc4684d53ca4b7c36c7769650aea5cba586c6f85cb5f7ec731cca5ce94f5586` | 71 |
| F4.vote(no) | ok | `0xc3116dc8b58a6f4d16a041de7237f61074f41280b9e1d3f4c43d19ad615dd83d` | 74 |
| F3.close_vote | ok | `0x6716f4734ff22895a0cceda328ad29d29f199fb91f7de2055daeb0038eab2448` | 15 |
| F4.challenge | ok | `0x269c3b30f0833fb2a2ffd93b249e3248fece8b029ac4a623835d163806b25a60` | 30 |
| F0.finalize | ok | `0xcd576c065ab40b78550bdfbe6f9e4fb1c16a1b64b08a3dd4857fd0a83de70a96` | 29 |

## S6  Treasury grant (size raises the floor tier) and payout

- ✔ F3 files a grant to G
- ✔ a grant of at most 10% of the treasury has floor tier 1
- ✔ F4 classifies
- ✔ S6: stored touches cover exactly the other articles
- ✔ S6: every stored touch is a real boolean
- ✔ S6: tier = max(floor, touched tiers) = 1
- ✔ S6: reason is stored as free text
- ✔ AI expectation: paying a hall rental touches nothing
- ✔ F0 vote accepted
- ✔ F1 vote accepted
- ✔ F2 vote accepted
- ✔ F3 vote accepted
- ✔ F4 vote accepted
- ✔ close_vote
- ✔ finalize
- ✔ grant motion is ENACTED
- ✔ treasury paid out exactly the grant
- ✔ G is owed exactly the grant
- ✔ after grant: contract is solvent (balance >= books)
- ✔ after grant: ledger balance equals the chain balance
- ✔ after grant: pull-payment total equals the sum of member balances
- ✔ G payout: ledger owes exactly 0.001 GEN
- ✔ G payout: withdraw accepted
- ✔ G payout: ledger zeroed immediately
- ✔ G payout: withdraw transaction finalized
- ✔ G payout: payout arrived (0.001 GEN)
- ✔ after G payout: contract is solvent (balance >= books)
- ✔ after G payout: ledger balance equals the chain balance
- ✔ after G payout: pull-payment total equals the sum of member balances
- ✔ after G payout: books fully settled (balance == treasury + escrow + claimable)
- · AI (strict) touched [] -> tier 1
- · waiting for chain time 1795250714 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F3.file_grant | ok | `0x959421ef89fa481aa649d6a72d49e871775514364432b11bbe563aaba3341811` | 14 |
| F4.classify | ok | `0x7e5f7263e7a3976c7c80b0412636b43d5f9c7556ba89656a928e28a3d2b158e5` | 29 |
| F0.vote(yes) | ok | `0x9a7d28c93abe4683717e873e6b2ef539c47a1a6f3e0d4995adfc7ee5ffab9fda` | 64 |
| F1.vote(yes) | ok | `0xa818b2f9455662f4147b1bf291143887595ce38a87d2212bd5232ee51be3250b` | 67 |
| F2.vote(yes) | ok | `0x472d2b1678ffce40a5f84f40b5530e82aa7343b08b2862ef01674174299c140e` | 69 |
| F3.vote(yes) | ok | `0xf1219320979ed8963553277def345a946416a455fd80b7b1311395fdb6d1e2a0` | 71 |
| F4.vote(yes) | ok | `0xb48b871ed60fe171dff072a3b1d9ddb90f9d24e05448f329d5479f27575f7e4e` | 74 |
| F0.close_vote | ok | `0x94859739d97fb737216b28eddb09770407041c9696faff0e5712065141515a6c` | 30 |
| F1.finalize | ok | `0x64d74592309e9478f3001d9bd49dc860b4da87f7f17fd2377a31ebf7b7118130` | 13 |
| G.withdraw | ok | `0x610d1a24be442525131547b10d138b15701803cc9798d00964703e17e8176607` | 14 |

## S7  Admission: the roster grows, the new member can act

- ✔ F0 proposes to admit O
- ✔ admission has floor tier 2
- ✔ F1 classifies
- ✔ S7: stored touches cover exactly the other articles
- ✔ S7: every stored touch is a real boolean
- ✔ S7: tier = max(floor, touched tiers) = 2
- ✔ S7: reason is stored as free text
- ✔ F0 vote accepted
- ✔ F1 vote accepted
- ✔ F2 vote accepted
- ✔ F3 vote accepted
- ✔ F4 vote accepted
- ✔ close_vote
- ✔ finalize
- ✔ admission is ENACTED
- ✔ the roster now has six members including O
- ✔ O, now a member, can file a motion
- ✔ O withdraws it
- ✔ after S7: contract is solvent (balance >= books)
- ✔ after S7: ledger balance equals the chain balance
- ✔ after S7: pull-payment total equals the sum of member balances
- · AI (strict) touched [] -> tier 2
- · waiting for chain time 1795251126 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F0.file_admission | ok | `0x6d726f9b31bea231058e47365ab345d0073edb3cfc3b7b96bbe21cc5c5f630c9` | 14 |
| F1.classify | ok | `0x8e6226b7290911312cb803bf116e89cd91ad50695e209177b84b610fc5322a8c` | 29 |
| F0.vote(yes) | ok | `0xd83940c6842dcf6a1c7bb95aa2db820f1d70e3f3536a11e248f4a0c39f6f18dd` | 64 |
| F1.vote(yes) | ok | `0x208a3eb35d9ff8af7a6cd24f03891c1bf941c173b8e445d787418b5477bf2749` | 66 |
| F2.vote(yes) | ok | `0x7609a38261cbc1fc6bea5276c144f38bb53dcb48abe8dfbc4df0cd6bcf9a0237` | 69 |
| F3.vote(yes) | ok | `0x64602a8efbef2fbff13b136930c9d8563a35762b33988fc7aca035bfb6ab137b` | 71 |
| F4.vote(yes) | ok | `0xd0d7ac9e9108c2bb24ef4bbebf62cf4c75cbe306f04f634f6e959b11d5348e10` | 74 |
| F2.close_vote | ok | `0xd693d8570144cc83769cb1c16cb0764eaee1e48163f4f7323757484bea5fdc2f` | 15 |
| F3.finalize | ok | `0x8c1c4a6bc3b2a1fc406d283202ef63cb3935c71b753735073e4c5a170d9deb0f` | 28 |
| O.file_amendment | ok | `0x5837880da08061fe585a1dc058a5fbb987e130d80ddf5f711214783a2e6f4af0` | 14 |
| O.withdraw_motion | ok | `0x3a38c0808e20a0e56c78f92a9d7aaf1f90a4fc3f43799545abbd185fcd89fe92` | 14 |

## S8  Lapse: a motion nobody votes on forfeits its bond to the commons

- ✔ F2 files
- ✔ F3 classifies
- ✔ S8: stored touches cover exactly the other articles
- ✔ S8: every stored touch is a real boolean
- ✔ S8: tier = max(floor, touched tiers) = 1
- ✔ S8: reason is stored as free text
- ✔ close_vote after the deadline
- ✔ motion LAPSED
- ✔ its bond went to the treasury
- ✔ the floor is free again
- ✔ after S8: contract is solvent (balance >= books)
- ✔ after S8: ledger balance equals the chain balance
- ✔ after S8: pull-payment total equals the sum of member balances
- · waiting for chain time 1795251390 (voting window)

| tx | result | hash | s |
|---|---|---|---|
| F2.file_amendment | ok | `0x601aa48309ef5be750e2d9d628e1f7300dfb9e5736a10819698c693ddb090a4d` | 14 |
| F3.classify | ok | `0x685b4606fd8dd2f93eedf5bcd383f5933c8d5c89c46cf6cc92fe32792a4113c0` | 29 |
| F4.close_vote | ok | `0xf96f98633022dfc3c9e713f96c30149eed15008bdeabeed4b7be8b47ec03d68d` | 13 |

## Final reconciliation

- ✔ every motion is in a final state
- ✔ the floor is free and escrow is empty
- ✔ stats.filed equals the number of motions
- ✔ stats.enacted / rejected / lapsed / void match the records
- ✔ challenge counters match the records
- ✔ motion 2 (AMEND/ENACTED): stored touches cover exactly the other articles
- ✔ motion 2 (AMEND/ENACTED): every stored touch is a real boolean
- ✔ motion 2 (AMEND/ENACTED): tier = max(floor, touched tiers) = 1
- ✔ motion 2 (AMEND/ENACTED): reason is stored as free text
- ✔ motion 3 (AMEND/REJECTED): stored touches cover exactly the other articles
- ✔ motion 3 (AMEND/REJECTED): every stored touch is a real boolean
- ✔ motion 3 (AMEND/REJECTED): tier = max(floor, touched tiers) = 3
- ✔ motion 3 (AMEND/REJECTED): reason is stored as free text
- ✔ motion 4 (AMEND/REJECTED): stored touches cover exactly the other articles
- ✔ motion 4 (AMEND/REJECTED): every stored touch is a real boolean
- ✔ motion 4 (AMEND/REJECTED): tier = max(floor, touched tiers) = 3
- ✔ motion 4 (AMEND/REJECTED): reason is stored as free text
- ✔ motion 5 (AMEND/ENACTED): stored touches cover exactly the other articles
- ✔ motion 5 (AMEND/ENACTED): every stored touch is a real boolean
- ✔ motion 5 (AMEND/ENACTED): tier = max(floor, touched tiers) = 1
- ✔ motion 5 (AMEND/ENACTED): reason is stored as free text
- ✔ motion 6 (GRANT/ENACTED): stored touches cover exactly the other articles
- ✔ motion 6 (GRANT/ENACTED): every stored touch is a real boolean
- ✔ motion 6 (GRANT/ENACTED): tier = max(floor, touched tiers) = 1
- ✔ motion 6 (GRANT/ENACTED): reason is stored as free text
- ✔ motion 7 (ADMIT/ENACTED): stored touches cover exactly the other articles
- ✔ motion 7 (ADMIT/ENACTED): every stored touch is a real boolean
- ✔ motion 7 (ADMIT/ENACTED): tier = max(floor, touched tiers) = 2
- ✔ motion 7 (ADMIT/ENACTED): reason is stored as free text
- ✔ motion 9 (AMEND/LAPSED): stored touches cover exactly the other articles
- ✔ motion 9 (AMEND/LAPSED): every stored touch is a real boolean
- ✔ motion 9 (AMEND/LAPSED): tier = max(floor, touched tiers) = 1
- ✔ motion 9 (AMEND/LAPSED): reason is stored as free text
- ✔ no final motion still holds a bond
- ✔ every ENACTED/REJECTED motion obeys its threshold exactly (yes >= votes_needed <=> ENACTED)
- ✔ every LAPSED motion had less than half the roster voting
- ✔ F0 withdraws 0.004 GEN
- ✔ F1 withdraws 0.004 GEN
- ✔ F2 withdraws 0.01 GEN
- ✔ F3 withdraws 0.004 GEN
- ✔ O withdraws 0.004 GEN
- ✔ final (ledger side): contract is solvent (balance >= books)
- ✔ final (ledger side): ledger balance equals the chain balance
- ✔ final (ledger side): pull-payment total equals the sum of member balances

| tx | result | hash | s |
|---|---|---|---|
| F0.withdraw (cleanup) | ok | `0xdb8a50a6d8c158ea831df90e0aa2da41ac743d200d7c8d9bd4f1117633203622` | 14 |
| F1.withdraw (cleanup) | ok | `0xabec2b24820dc6c2fa7663657246b9c6d1f209d87c5a9ecdb97e96eb5fd1c451` | 14 |
| F2.withdraw (cleanup) | ok | `0x5d4b6cc5102083cc2d1bb4d5a288b321c1e5d1764b1d24461821d2d548c5a86e` | 14 |
| F3.withdraw (cleanup) | ok | `0xb3f91caba282ff1c0156576e60eeca334b65b8e7b85f86b1438779872c743893` | 14 |
| O.withdraw (cleanup) | ok | `0x5b88130d9d6a8ab0dfccdb2fe9297835b80bd2b05429bdc3bea2d5fb0cc98cf0` | 14 |

## Whole-run conservation of funds (waits for delayed payouts)

- ✔ F0: balance equals start - attached + withdrawn (exact)
- ✔ F1: balance equals start - attached + withdrawn (exact)
- ✔ F2: balance equals start - attached + withdrawn (exact)
- ✔ F3: balance equals start - attached + withdrawn (exact)
- ✔ F4: balance equals start - attached + withdrawn (exact)
- ✔ O: balance equals start - attached + withdrawn (exact)
- ✔ G: balance equals start - attached + withdrawn (exact)
- ✔ final: contract is solvent (balance >= books)
- ✔ final: ledger balance equals the chain balance
- ✔ final: pull-payment total equals the sum of member balances
- ✔ final: books fully settled (balance == treasury + escrow + claimable)
- ✔ after every payout the contract holds exactly the commons treasury
- · delayed-payout sweep took 175 s
