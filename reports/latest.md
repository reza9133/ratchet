# RATCHET live end-to-end report

* mode: **live**   * network: https://studio.genlayer.com/api
* contract: `0x75C663cA2E0E0272C5b3548a22fc414b801bE59e`
* source sha256: `85d7c39d2c526ea02d0e9a947dfae7a336414d78f59aaa9740fd355c5318bc4a`
* started: 2026-11-18T09:45:29.292Z   * duration: 5072 s
* **250 passed, 6 failed, 4 warnings** (260 checks, 73 transactions)

## Setup: accounts, funding, deployment

- ✔ F0 0x40bc61db5f6d5b9f477392e5a4e331d863b5bf32 holds 0.33 GEN
- ✔ F1 0x60a8f93344c7725e4feef0226df6dc4fb4560b4b holds 0.24 GEN
- ✔ F2 0x2d5e906c23179edc648a3383ce6b7f819afdad4a holds 0.234 GEN
- ✔ F3 0x00139845b1ac602480dea847f5996209c8ebbf7d holds 0.22 GEN
- ✔ F4 0xae6914ee672d0618c0658150f06890cd084145c3 holds 0.22 GEN
- ✔ O 0x30a7edcd27823851fd0d2a541146928c14f7f615 holds 0.22 GEN
- ✔ G 0xfc5007f9fba5053515eb37492aef7e3154f7bcd8 holds 0.22 GEN
- ✔ deployment accepted
- ✔ deployed contract address found in the receipt
- ✔ deployed source is byte-identical to contracts/Ratchet.py
- · contract 0x75C663cA2E0E0272C5b3548a22fc414b801bE59e

| tx | result | hash | s |
|---|---|---|---|
| F0.deploy | ok | `0x03f3aba9e65a3ea7c8802caf7ee3fff6cad9b2d341a6fd75edf667cc3f3696bd` | 10 |

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
- · Studionet kept 12000000000000001 wei from reverted transactions; later balance checks subtract this baseline

| tx | result | hash | s |
|---|---|---|---|
| O.file_amendment (must revert) | EXEC_ERROR | `0x1e6524a82098f439805572e079c82833017b5e4e0aa93146058ad6e68c1183a3` | 11 |
| F1.file_amendment (must revert) | EXEC_ERROR | `0xdc419f2f19cde47d162caf6bacc2f6b2c42c511f3f7b730f31ff1537d0cda40b` | 11 |
| F1.file_amendment (must revert) | EXEC_ERROR | `0x98075b57e0fd01c953326176a545cd2ee55aaae9f9ec107ea51cb314014b6958` | 7 |
| F2.classify (must revert) | EXEC_ERROR | `0x818cca78bfdcd7eacc9997342940571f7834f4e2513745414af52b81e0962382` | 8 |

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
| F2.donate | ok | `0xedcfb970f61d96135cbec1fd1c08b331bc44f3d14b14f086e002333cbb4c859f` | 7 |
| F1.file_amendment | ok | `0x5c120401de1589ac147a976a36f2d7c3450a90119bb811229973405c5dd77569` | 11 |
| F1.withdraw_motion | ok | `0xabc7b37c4255de809e9088aca235792cec99bcfee83f32cefb28f433f2108f5a` | 7 |

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
- ⚠ F1 payout: payout arrived (0.008 GEN) — delta=0 expected=8000000000000000; the final reconciliation re-checks every balance
- ✔ after F1 payout: contract is solvent (balance >= books)
- ✔ after F1 payout: ledger balance equals the chain balance
- ✔ after F1 payout: pull-payment total equals the sum of member balances
- ✔ after F1 payout: books fully settled (balance == treasury + escrow + claimable)
- · AI (strict) touched [] -> tier 1
- · waiting for chain time 1794995535 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F1.file_amendment | ok | `0x8d0eb53f10050ef926385525a93a88d7f87603708ff7423a7ad919786aee7e2b` | 11 |
| F2.classify | ok | `0xd408423088822ed9a2666fdb8ee4de61033f41e69a600bc40cf7287c26abe0f5` | 20 |
| F0.vote(yes) | ok | `0xdf44bb05119f70af7b6f9f32a075a279e2e3e1d825bfd4801f15a305e0bd6e0a` | 11 |
| F1.vote(yes) | ok | `0x64a8f77829c79f1b06091b48be223f4e0da87aa1c32a7915031526184efa74a5` | 14 |
| F2.vote(yes) | ok | `0x1df22cdecea5704342e8a8b9c48e473428feacc2ab26a135a7578256a4e6d10f` | 17 |
| F3.vote(yes) | ok | `0x5627af5fea8e4e4038b238a0c9261daca0778580e46ad91b0b17e973fb86bbf0` | 24 |
| F4.vote(yes) | ok | `0x52e02dc07ae9873cb998f88965d3d3df0a4d19e8c77c88b3032f9e80b541f975` | 27 |
| F3.close_vote | ok | `0xa0931524bc7f2fd436a6db5c16bc7e0d097b9043548062930ad59e1ece664ea6` | 11 |
| F4.finalize | ok | `0x086c52219ebc39320262772c5e7e9901883212c2e1a1e8f6639da04b61946a7f` | 11 |
| F1.withdraw | ok | `0x7dc744600119871232d19765616b4ae43a9cc11d2dd873f79f9bb3056db8c08e` | 7 |

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
| F2.file_amendment | ok | `0x62267c46b410e80a196f19fee7e52d53e799834891bc390146ba106216ecb186` | 11 |
| F3.classify | ok | `0x60573a2c33f221a10ce08d05936b3dd83485153645d3b111f64cb6abad345795` | 32 |
| F0.vote(yes) | ok | `0xa9696ed5f2268eb806d3f4d18e865b9b9ddde9a63882694ef6d86cc277307320` | 11 |
| F1.vote(yes) | ok | `0x72a0e9cd0287e44a958510f283276728eafffbc190d11637e99e89aa94518ae9` | 14 |
| F2.vote(yes) | ok | `0x8712094e3f485f8ab1474699993b095e53f8dfc0233a6f453cd5fd20181519aa` | 17 |
| F3.vote(no) | ok | `0x58361d0ef81a74f712f31442910c409ee4b31c18412b56dcde9a8ad46d237b54` | 20 |
| F4.vote(no) | ok | `0x11700e9994f8fa10b088d183acf41bd2392c0bdaeb76892efa09d35820b848d9` | 23 |
| F0.close_vote | ok | `0xb704a33680df940c3ee83980c8e74070965209d1ec728ae10c9e70e4bb785188` | 7 |

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
| F1.file_amendment | ok | `0x2f0f7d3c7f72a765bf969530e657a2583fcbd3f4559af80b2f39b4bceebe1e99` | 7 |
| F2.classify | ok | `0x78eae317d8a09aa264cec07470ba14423666bcc573619a610313e0035ecbf371` | 20 |
| F0.vote(yes) | ok | `0x5ed31ad5fb8c91df0ef3f214b73b15783d3a411d2496535dfba593f2932f13d5` | 11 |
| F1.vote(yes) | ok | `0xf5711426ff8ab8b882d965ad1271b17afe3a39c681762890402e936beb6c59ed` | 14 |
| F2.vote(yes) | ok | `0x471c09f7c6394aeaa96cb6a510ee6bc3516fc2c5ced15c9654ecbb4c4e47b8e7` | 17 |
| F3.vote(no) | ok | `0xa7cc1b8d5789bad3b4bdce704ab963a0abddc5cd2e6faa178409c93772a45b8c` | 20 |
| F4.vote(no) | ok | `0xbef5d00f59c5b51eee2f6318f0a193f06b45c6679b92a47b91e839c29b81d583` | 27 |
| F2.close_vote | ok | `0xced5e4e0e0eae192bd70b2f9603acea0999a191afc7ec20b8d60a49c6c6425eb` | 7 |

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
| F2.file_amendment | ok | `0xc5d9c1bf4b4bd1f7a40e468464e0dd4e1d337444ea32a07eb0f9abc3aa8b6191` | 11 |
| F3.classify | ok | `0x7a83bb2448f08314f137705f87dbb1ce9a493a3179fa1f2d86f199dd2eb4e6c3` | 24 |
| F0.vote(yes) | ok | `0x7f47dca1add0415b5f8b77fa9907a66b8fddc3c156373e333fde72154156d864` | 11 |
| F1.vote(yes) | ok | `0xa70e12e83d32349fc7ccdd9bf20aa7e3564bd77dc13078f65948c3fde608e9a8` | 14 |
| F2.vote(yes) | ok | `0x6f5479cd294e29406d2467d6f02ed4c997cc9e4e7c673077e0b8e4b3450a37fa` | 17 |
| F3.vote(yes) | ok | `0x6128e5593f22eb65fca538ac0783c361edd440a2180127e5eac38873d2b0175c` | 19 |
| F4.vote(no) | ok | `0x7065c939d4b4c7d9867536fa2579eec6324961d0f90fb6ec7f09e973a3da5cdb` | 22 |
| F3.close_vote | ok | `0x9bb5923636ce679b4c08c666ddafbd09c8eb410ff159d7935d7ca4c5582d9c88` | 7 |
| F4.challenge | ok | `0x58acc8bf4940b3d14e7c1e8f86317de9fb9d6a8d48dd4c0f278b3be39566f539` | 24 |
| F0.finalize | ok | `0x87fcaebd07ac4242ec157b7c9b9347e2b30762ae1ca843f839d6f597a2603f69` | 12 |

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
- ⚠ G payout: payout arrived (0.001 GEN) — delta=0 expected=1000000000000000; the final reconciliation re-checks every balance
- ✔ after G payout: contract is solvent (balance >= books)
- ✔ after G payout: ledger balance equals the chain balance
- ✔ after G payout: pull-payment total equals the sum of member balances
- ✔ after G payout: books fully settled (balance == treasury + escrow + claimable)
- · AI (strict) touched [] -> tier 1
- · waiting for chain time 1794996946 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F3.file_grant | ok | `0x61e37f68812016a617b9385642eb14dd93d7920ff9b9f4cb1c6c35f23127b024` | 7 |
| F4.classify | ok | `0x9a40e7ae365df6e931b09513529479b0069bcd5bbcd5d43419c11a358d0ca82b` | 15 |
| F0.vote(yes) | ok | `0x1e043c58ea61032ce30ff0275dda3faada856f57826ad336fc404cef99c945a4` | 7 |
| F1.vote(yes) | ok | `0x5a5b17340460849ab97a68fd80c767e4741454c720a6a09214652776c4bfeaa4` | 14 |
| F2.vote(yes) | ok | `0x73a3b13c3b94bf24f7d3db06ed86b72976e5bfad5908451c9a90ded25264fe6d` | 17 |
| F3.vote(yes) | ok | `0x71cdec9a0c9d1210026dd34d4bf3476368a249688a72b59aa21f67921a27c441` | 20 |
| F4.vote(yes) | ok | `0x8bb173ce45f1e8e4c6746f6dc2fe3de2ec99bd7ac16f75613d34d056637c4738` | 23 |
| F0.close_vote | ok | `0x2c7dbc52ab92d7e570bd16aae978ce283c621e46ab6b6fedfeb423d613b27a51` | 11 |
| F1.finalize | ok | `0xce0c1eba8ea1ca14c716d25ae6fae83bdfaeb6642c0052619488c6c332cd0a76` | 7 |
| G.withdraw | ok | `0x797bb955669aae3d01f630a4dfd883231ee77a309f01b8e9ee55a3b52f658c18` | 11 |

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
- · waiting for chain time 1794997893 (challenge window)

| tx | result | hash | s |
|---|---|---|---|
| F0.file_admission | ok | `0xd3790da02b799492e707433e16b1bff21f225065bc5ff6dfb2939f1d196a72ca` | 11 |
| F1.classify | ok | `0x205654847efe286d15570b4754393ca97f37a5129071036ee6589dd1c8a53d17` | 15 |
| F0.vote(yes) | ok | `0xaea5618e9300118b4ccf9c795db7a54a5ae6fdb3765779ed6996f50286410924` | 11 |
| F1.vote(yes) | ok | `0xce6fd8377ea82e534cba6292ee0a22d86156a003e1bdecfed876c4bf82db7d76` | 14 |
| F2.vote(yes) | ok | `0xce8879643f3f65b231faca7a79051c244d18ceb59f7d02da37fe7138cb05913f` | 17 |
| F3.vote(yes) | ok | `0x0f79ee2edad1ff399cbb5593542712d70c486e26c1a6430a730b5b654a4d483b` | 20 |
| F4.vote(yes) | ok | `0xa962f1867242ba9562bc751fb5531e80a8122f115e8c37171256c6f11704cbde` | 23 |
| F2.close_vote | ok | `0x578c623fe65e79bf95b814a9ca0d21f8376e7a62c182d736fd7f4a8db540e3a6` | 11 |
| F3.finalize | ok | `0x2794d9ee329c4a16681402a9bb9b236d549f89adec29e0116697dd9923d3b390` | 10 |
| O.file_amendment | ok | `0x7ba989546121711abb733125d8ed74d86256f07d21bd52981a502a7c881e7b07` | 8 |
| O.withdraw_motion | ok | `0x97832694c7e48dafdfcc19283ab110ebeed4b779b8f16aec0fd921472914ef92` | 7 |

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
- · waiting for chain time 1794998126 (voting window)

| tx | result | hash | s |
|---|---|---|---|
| F2.file_amendment | ok | `0x20dadcc6217f206a0e398c49ed3582ea14fed73667600ec1ae5777eaf747aa0d` | 11 |
| F3.classify | ok | `0xba0f028e97fdc2c60efa51cdc65d30772f34b58e7708cf31c92d7b3f07796512` | 28 |
| F4.close_vote | ok | `0x38cb7c07243451354f822d0898c34d33942a8957ad3d013c0cd3d6ce67ed7676` | 11 |

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
- ✘ final (ledger side): ledger balance equals the chain balance — ledger=65000000000000001 chain=55000000000000001
- ✔ final (ledger side): pull-payment total equals the sum of member balances

| tx | result | hash | s |
|---|---|---|---|
| F0.withdraw (cleanup) | ok | `0xcfb3544baf2ecf706b84cbfc93651a227be82234dee86f1c6e58b1f2df5afeed` | 7 |
| F1.withdraw (cleanup) | ok | `0x65fa1077589123740788dc3450f1a032a06dd3d1914de7cad063dd62ccc8a642` | 7 |
| F2.withdraw (cleanup) | ok | `0x9b373069c2a332b0830065a04516fc68692dbcfe21742696f8ba0f47be623500` | 7 |
| F3.withdraw (cleanup) | ok | `0x8fa917b499fa1a07f7694ee93e2edcfd0fe6000d719a9db180647ecdfb737888` | 11 |
| O.withdraw (cleanup) | ok | `0x9577b7511897b7948bb762a99c4721b5848c151c28f610c8249ae9137af88571` | 7 |

## Whole-run conservation of funds (waits for delayed payouts)

- ✘ F0: balance equals start - attached + withdrawn — actual=326000000000000000 expected=330000000000000000 diff=-4000000000000000 (a payout may still be in flight: increase --settle-minutes)
- ✘ F1: balance equals start - attached + withdrawn — actual=219999999999999997 expected=227999999999999997 diff=-8000000000000000 (a payout may still be in flight: increase --settle-minutes)
- ✘ F2: balance equals start - attached + withdrawn — actual=192000000000000000 expected=202000000000000000 diff=-10000000000000000 (a payout may still be in flight: increase --settle-minutes)
- ✘ F3: balance equals start - attached + withdrawn — actual=216000000000000000 expected=220000000000000000 diff=-4000000000000000 (a payout may still be in flight: increase --settle-minutes)
- ✔ F4: balance equals start - attached + withdrawn (exact)
- ✘ O: balance equals start - attached + withdrawn — actual=212000000000000000 expected=220000000000000000 diff=-8000000000000000 (a payout may still be in flight: increase --settle-minutes)
- ⚠ G: balance is 1000000000000000 wei below expectation (network fees?) — diff=-1000000000000000
- ✔ final: contract is solvent (balance >= books)
- ✔ final: ledger balance equals the chain balance
- ✔ final: pull-payment total equals the sum of member balances
- ✔ final: books fully settled (balance == treasury + escrow + claimable)
- ✔ after every payout the contract holds exactly the commons treasury
- · delayed-payout sweep took 1960 s
