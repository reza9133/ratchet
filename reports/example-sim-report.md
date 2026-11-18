# RATCHET live end-to-end report

* mode: **sim (local Direct Mode bridge, real contract code)**   * network: simulated
* contract: `0x351db488927e6c40a1b12f8ff81f421abdc578e7`
* source sha256: `85d7c39d2c526ea02d0e9a947dfae7a336414d78f59aaa9740fd355c5318bc4a`
* started: 2026-11-16T05:56:32.546Z   * duration: 1 s
* **278 passed, 0 failed, 0 warnings** (278 checks, 75 transactions)

## Setup: accounts, funding, deployment

- ✔ F0 0x5dacab126c9a252de8fb029aef2e6a9a5b674219 holds 1 GEN
- ✔ F1 0xa793b47047bf2435cf64f292d73f8728da3fb38e holds 1 GEN
- ✔ F2 0xd27f5bb74feed62af143851eee490db6b6c3c1e4 holds 1 GEN
- ✔ F3 0x91790ad8d6b92db8b56f9bdfbd84581cd88b66a2 holds 1 GEN
- ✔ F4 0x86085fc28a812c359eb6cc530a0711c70e7c5904 holds 1 GEN
- ✔ O 0x2971342b1b3dc1fbbb2b4d07e2c20fa45cba6a20 holds 1 GEN
- ✔ G 0xa798d15363f2bebc03a073932770cda07b24f394 holds 1 GEN
- ✔ deployment accepted
- ✔ deployed contract address found in the receipt
- ✔ deployed source is byte-identical to contracts/Ratchet.py
- · contract 0x351db488927e6c40a1b12f8ff81f421abdc578e7

| tx | result | hash | s |
|---|---|---|---|
| F0.deploy | ok | `0x95340b1961d6e9b9175f1621ca7285dc8dbbde54aa5756876d1c2df063368cfc` | 0 |

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
- ✔ failed transactions did not leave value in the contract

| tx | result | hash | s |
|---|---|---|---|
| O.file_amendment (must revert) | EXEC_ERROR | `0xbdc5e820a03b4eca0572020685aa9ed9441e9ef99ea9685bb848f56a0e111f82` | 0 |
| F1.file_amendment (must revert) | EXEC_ERROR | `0x58aaefd082f891d851b20d6237c0b8ff8738d0573798659f4da2f8d9b859edef` | 0 |
| F1.file_amendment (must revert) | EXEC_ERROR | `0x29c1550790d755c4fb6bf6f0aae9d126bdcfb144ecff4af502447a98f025e8dd` | 0 |
| F2.classify (must revert) | EXEC_ERROR | `0x4722d59bf9d4c9ee5b8609b69b9dddfca7cb2a61de85751c6ebc675ac1439e7f` | 0 |

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
| F2.donate | ok | `0xdddb6e236c8a9679364b15c8c9ee293540e7bf0c25ca697d1e24b58e6af4265a` | 0 |
| F1.file_amendment | ok | `0x22fe305e8fe64dc1d5555192bd8a9ba15e6128810398a95b78368bf219910b85` | 0 |
| F1.withdraw_motion | ok | `0x0166d5468757a8c7937182d1ef58a244851f84a800a205a416cbc2a18cfee064` | 0 |

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
- · waiting for chain time 1793534540 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F1.file_amendment | ok | `0x03bb3630eca5132d6cf0282ab808d29a2464bbbfb0bb126545f94d9eb4d9e33d` | 0 |
| F2.classify | ok | `0x49a2ce886498421612d7a85e8ab45c4a26305dc8c761a049ae765bdfcc7a7e68` | 0 |
| F0.vote(yes) | ok | `0x91505f5d504ab1528bddee21aec9b17f84203d0c3bedeb0b0c4097c5d2d09451` | 0 |
| F1.vote(yes) | ok | `0x7d684fa42716786e6d6fb83af979064fe4d2de3fd0cdb94e12276e0634165741` | 0 |
| F2.vote(yes) | ok | `0x601bd20f21c05c858d08ee8cc265f7b932e118ba3c57cae503ab94e559590a17` | 0 |
| F3.vote(yes) | ok | `0xb37e3c99207a86e42b4793ed3a21e644770abb0be841eb2914e963a0280ed58a` | 0 |
| F4.vote(yes) | ok | `0xbfb5ebe0303252d8db42cfc97a1146d8d04b254dd961fa0d3cbfc5358f365f0d` | 0 |
| F3.close_vote | ok | `0xdb98dd9fd98766ae3061901bee2e97021c1b7d59af0df109c371da325fc882be` | 0 |
| F4.finalize | ok | `0xccd61908661c6fc093805c835b581786d58198e2b1fac06e0805b1988c289cd2` | 0 |
| F1.withdraw | ok | `0x051b192e4e9ba9b6cc789a4930f714a9e5c3e102152f3f63a5eb414819f4885a` | 0 |

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
| F2.file_amendment | ok | `0x07de50c30b01af7079e866772758a3b033bb09cfb122e144b61929e346665ce4` | 0 |
| F3.classify | ok | `0x218dab678ed25fcde9ba9b3051d7f0a9d668014fa12ce0c306b6da324e79a973` | 0 |
| F0.vote(yes) | ok | `0x0811fdb354a408eb41b755022d4b3a8a09aca0c1a51c623afba50d31cc86c31e` | 0 |
| F1.vote(yes) | ok | `0xff7bedf0a37aa95943b756eca7ccc5a77d6e85fbeea69480134f53e05f931612` | 0 |
| F2.vote(yes) | ok | `0x70e2f7e3a031cbea7022e8d82fda400a4802f9a40229584a6a9d25bca6bfc4e4` | 0 |
| F3.vote(no) | ok | `0x58265688e971700bd5147a675ac42f71818b78947b958f0c8bcb049c6d29889d` | 0 |
| F4.vote(no) | ok | `0xdd6d25f15da72d42107b6196e1d86b5ad95ee4fb7c23c62a0a9289f68b563251` | 0 |
| F0.close_vote | ok | `0x44f431f602913df0ca7c08ad45da4b8e87458349066bc41a9d4c9db32e5b98e5` | 0 |

## S5  The ratchet: challenging a strict reading (stealth motion)

- ✔ F1 files "TREASURER"
- ✔ F2 classifies (STRICT reading)
- ✔ S5 initial: stored touches cover exactly the other articles
- ✔ S5 initial: every stored touch is a real boolean
- ✔ S5 initial: tier = max(floor, touched tiers) = 1
- ✔ S5 initial: reason is stored as free text
- ✔ F0 vote accepted
- ✔ F1 vote accepted
- ✔ F2 vote accepted
- ✔ F3 vote accepted
- ✔ F4 vote accepted
- ✔ close_vote
- ✔ F3 challenges (INCLUSIVE reading, bond attached)
- ✔ S5: exactly one challenge is recorded, by the challenger
- ✔ S5 after challenge: stored touches cover exactly the other articles
- ✔ S5 after challenge: every stored touch is a real boolean
- ✔ S5 after challenge: tier = max(floor, touched tiers) = 3
- ✔ S5 after challenge: reason is stored as free text
- ✔ AI expectation: the inclusive reading should see that unrestricted spending bypasses A3
- ✔ S5 ratchet: no article that was touched before became untouched
- ✔ S5 ratchet: the tier never went down
- ✔ S5: raised flag equals (tier after > tier before)
- ✔ S5 raised: challenger recovers own bond plus half of the proposer's bond
- ✔ S5 raised: the commons is untouched
- ✔ S5 raised: half the proposer bond stays in escrow
- ✔ S5 after challenge: contract is solvent (balance >= books)
- ✔ S5 after challenge: ledger balance equals the chain balance
- ✔ S5 after challenge: pull-payment total equals the sum of member balances
- ✔ finalize right after the challenge (no waiting)
- ✔ S5: 3 yes votes vs 4 needed at tier 3: motion is REJECTED
- ✔ S5: proposer bond routing after settlement
- ✔ after S5: contract is solvent (balance >= books)
- ✔ after S5: ledger balance equals the chain balance
- ✔ after S5: pull-payment total equals the sum of member balances
- · AI (strict) touched [] -> tier 1
- · AI (inclusive) touched [A3]: tier 1 => 3; challenge RAISED the tier
- · S5 challenge game: tier raised, motion REJECTED

| tx | result | hash | s |
|---|---|---|---|
| F1.file_amendment | ok | `0xb0628f7dad5a08657a653d77c607bd79e4d41377282cd85d5fe9174b24daa17c` | 0 |
| F2.classify | ok | `0x66d46313b2b9d4c14e9dc209983879718ad22ce5ae431aacd5223a2afba773b6` | 0 |
| F0.vote(yes) | ok | `0xdb4e2afd76eee26bb0dafed34497dd324467c7a452539e00a2a373b9a69952bb` | 0 |
| F1.vote(yes) | ok | `0x1a5e72592f76aa1a24154872810526bf7e1d5c61074972ef0755d0972da53a2a` | 0 |
| F2.vote(yes) | ok | `0x87c8e9594573ee1163ff05764b9e092497c824179e42502996330b7055f07cb8` | 0 |
| F3.vote(no) | ok | `0x277c51e94eb223d6608ab40e81d0d90e9d24fb637a2cc64a214444de4bab35fc` | 0 |
| F4.vote(no) | ok | `0x58ce863d9b6ae4ebfef52b94cee5cafff77b500079213194b4738d1930013c2e` | 0 |
| F2.close_vote | ok | `0xd584e816d821d528b810e657850b7db3386c8cefc8d739e75868e574f47a78d4` | 0 |
| F3.challenge | ok | `0x00977296695205ae529d78ecd1b319b4999dd7e956a07f2d66f6b3b5191cdf72` | 0 |
| F4.finalize | ok | `0x1b32e5588b9658d7bede1b9241e5c57fdf4a3d380c4b58298fe9ed8801771596` | 0 |

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
| F2.file_amendment | ok | `0x9ee572fb592c47b0d95792b73e7e8001acdd6f163d8030b290aa55864ee07c2e` | 0 |
| F3.classify | ok | `0x990d58bb258325938e117bbcf8c225b15194071985d12e55d820acf7216aa549` | 0 |
| F0.vote(yes) | ok | `0xf9eef2f59a2e066cb0f0a9d5b58a0005c4ca711928ab245215cde98e8580967b` | 0 |
| F1.vote(yes) | ok | `0xd9f2cd1b5d95a22aec3ab444667c8274e73008f0f81e293eebe52ebdd05a47e6` | 0 |
| F2.vote(yes) | ok | `0x0f314996f102e737c7d197da5d9b3ed6734ca02217085df5a30b03de3ee451e6` | 0 |
| F3.vote(yes) | ok | `0x8f53555662dd0f68ac06682413ed10aa6abe99fa4f36a940b88b4975cb839116` | 0 |
| F4.vote(no) | ok | `0x3740ac70fd100642dfc60c756434654c29aac97bf9b9870cb61ecd4c63f5d1de` | 0 |
| F3.close_vote | ok | `0xa5bcbf57a095d64bf8588ac93b348a355279436bff3782a2e257427e6b310b4b` | 0 |
| F4.challenge | ok | `0x203851afbdd9feef092c9c850b309ac024b3d7bb007b0e876c9fc56ca4ac981b` | 0 |
| F0.finalize | ok | `0xc0d01bc7b059262cda3b4fb79782815cac02285fc171a417454c2ef57e0ac631` | 0 |

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
- · waiting for chain time 1793534742 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F3.file_grant | ok | `0xcfd2ef9d4424020bab9a1b3fb00fc591ce848d6309fc923fe616d4d2646fbe77` | 0 |
| F4.classify | ok | `0xfec7161f6f4228ab624daf15f5214e1d1453b5dead5c6f154d7195516ee6e853` | 0 |
| F0.vote(yes) | ok | `0x2127081197039ea427606793172d077df84ac3d39ed21b8ea9112e98a4b8a982` | 0 |
| F1.vote(yes) | ok | `0x604149f765b53ac2ac85b494eba4b4f56da60da4530e17c11146004374791515` | 0 |
| F2.vote(yes) | ok | `0x7460b56ea6e6b8bce9496e487883bca1e8cec25f5d85fd375aeead6666a1bf7a` | 0 |
| F3.vote(yes) | ok | `0xd8b5247a22b05d473627659d564d5b03ceb905fd9e5e0f63f4594ba2dc6f118f` | 0 |
| F4.vote(yes) | ok | `0x1da24528afe5f697ae2f1818bf694d47cb3358fffa5f23ac3ab6b72b2547e41e` | 0 |
| F0.close_vote | ok | `0x50485f9bd334bae89b657bb9f88102fffb2d6d56616540db8ea7e7de851504b1` | 0 |
| F1.finalize | ok | `0xc8f8a30aa3095b7a2bcb235d84e746f4d2a59588f4be291c2822ae602cbfd099` | 0 |
| G.withdraw | ok | `0xf79e6558d49cd841266920d202b152f4f9631c5723c4650c868eda71e8df02ad` | 0 |

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
- · waiting for chain time 1793534944 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F0.file_admission | ok | `0x46d7db4196c9e7fe22f95b76d69917bdcc43c9cb6afa29da0bb3cb31f2447529` | 0 |
| F1.classify | ok | `0x58fcef3f45e3e257d3a3ec2d2c71ff02030e6bfefc7ec1ed0811ce78262cb7ee` | 0 |
| F0.vote(yes) | ok | `0x804f7ee203ebcf3638ede73bd0dc6fdac5bfc15c7358ff361a82b7f375c16972` | 0 |
| F1.vote(yes) | ok | `0xb8d41242cb669db5fdc921e780a1b3375ac6c23a7aaf497becf891f41aa696ad` | 0 |
| F2.vote(yes) | ok | `0x2d98a593e81e5fe217b4f43a35171afee0a5ae1939ca33a17ea63c0dafeeb171` | 0 |
| F3.vote(yes) | ok | `0x25ac59f50ca70a18fd78a6cce70cfb3d9af3b0648faa3190132e4ef1909fbebc` | 0 |
| F4.vote(yes) | ok | `0x6754e21e30e6901dfbf8387901569bffcb3458a6f355749be23a196a5d56d52e` | 0 |
| F2.close_vote | ok | `0xbfb925c1eb25371e9e3a6e771c6caf139a9a62a0d47ac406f6ac18bd3d0d6a0c` | 0 |
| F3.finalize | ok | `0x2898acb95ca0b3c956948d7e4982498743b472ec7c92772663361bda93d466c1` | 0 |
| O.file_amendment | ok | `0xfd5c2837d02df0d127212cffee69b25e1ab2646a5a2030c37b0e63df702b5190` | 0 |
| O.withdraw_motion | ok | `0x40549c09bccfb8310b93aa9b5672706320fc3676d97293f81e925e08ed045844` | 0 |

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
- · waiting for chain time 1793535085 (voting window)

| tx | result | hash | s |
|---|---|---|---|
| F2.file_amendment | ok | `0xa0272ce62cdf36f63af328b498c7c36d3d1382e6f4d453d69aa11fb409ba7cd5` | 0 |
| F3.classify | ok | `0x81c3823e9ae690ae09231dd3c186e29bbbdf41672d83941257c725c22ba0536a` | 0 |
| F4.close_vote | ok | `0x5470a4bfd15c69577f53b3c8883a1d2ec41a79cb4b51433a60e2c928d10ca341` | 0 |

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
- ✔ F1 withdraws 0.002 GEN
- ✔ F2 withdraws 0.01 GEN
- ✔ F3 withdraws 0.01 GEN
- ✔ O withdraws 0.004 GEN
- ✔ final (ledger side): contract is solvent (balance >= books)
- ✔ final (ledger side): ledger balance equals the chain balance
- ✔ final (ledger side): pull-payment total equals the sum of member balances

| tx | result | hash | s |
|---|---|---|---|
| F0.withdraw (cleanup) | ok | `0x5ae4fd3ec57771cab38431681313b5247d38ab0c74700057bce2d91ad0bed8b2` | 0 |
| F1.withdraw (cleanup) | ok | `0xc7e6736c7047300ceb34dc0ce1e6036c4db6f5406d6027885ac11e534d589d09` | 0 |
| F2.withdraw (cleanup) | ok | `0x8421b20f0acec33e2cdb9a6de45e6c64f8a31d7676ea1f48e196f8db83e3e503` | 0 |
| F3.withdraw (cleanup) | ok | `0x60d3109f271e6c88e31ee5995bdc25c3f5b9f7945c8bbdaabab29858cef23298` | 0 |
| O.withdraw (cleanup) | ok | `0xe52b2eae48c67c0b28dbf4f67640b2662a3e188a0c73d1f6430ffb2471d54b9f` | 0 |

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
- · delayed-payout sweep took 0 s
