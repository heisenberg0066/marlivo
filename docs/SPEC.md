---
title: "MarLivo: private online multiplayer card game"
subtitle: "Product and technical specification, draft v0.7 (all decisions resolved; Phase 1 built)"
date: "22 Oct 2026"
---

# 0. How to read this document

Everything here is a proposal for Ammar to review. Nothing has been built yet.

- **RULE**: Ammar confirmed this rule. It is implemented exactly as written.
- **PROPOSAL**: my suggestion. Accept it, change it, or reject it.
- **QUESTION Qn**: a decision only Ammar could make. **As of v0.5 all 26 are resolved**; the decisions log is in §22.
- Source tags (same convention as the other specs in this folder):
  **[F]** page fetched and read · **[S]** read through a search-engine excerpt only · **[V]** seen in official screenshots · **[GK]** general knowledge, verify before relying on it.
- Section numbers are stable. Please comment as "§9.4: …".
- **RESOLVED (Qn)**: Ammar has decided; the spec now follows his answer.

**Change log**
- v0.1 (21 Oct 2026): first draft, 26 open questions.
- v0.2 (21 Oct 2026): Ammar answered 8 questions. Name left to him (placeholder used); new wrong-card rule (§3.4, §3.6); dice roll to pick the first starter, then the last winner starts (§4.5); Jack may swap any two face-down cards (§6.1); Queen optional with peeking as the obvious default, 10 mandatory (§6.2–6.3); penalty placement: gaps first, then a random extra position (§7.2); all cards always revealed at round end; a friendly, cosy back-room mood (§14.3). Examples, UI, animations, edge cases and tests updated to match.
- v0.3 (21 Oct 2026): languages are now **English and French only**; Arabic, Swedish and every RTL requirement removed (§15). Card names are English only (J/Q/K/A) in both languages, with no Arabic-letter option (Q21 resolved). The name is still TBD; Ammar's new candidates (based on Ammar and his best friend Liv, "Livooo") are listed in Appendix A.
- v0.4 (21 Oct 2026): **name decided: MarLivo** (Ammar + Liv/"Livooo"); slug `marlivo` (repo `heisenberg0066/marlivo`). Q1 resolved.
- v0.7 (22 Oct 2026): **match attempts revised** (§3.6): flipped cards stay face up until Done/Stop, tap to turn back, Done submits, no auto-end; UI tap guards. **Card layout picker** (§7.2): each player picks a starting layout (one line, 2 rows, 3 rows, 4 rows, as the card count allows) in the solo setup / lobby, with a preview; locked once play starts. 3D table mode (§14) as an option in Settings.
- v0.5 (21 Oct 2026): **Ammar answered all remaining questions; none are open.**
  - No matching priority: server arrival order, except the turn-player finish rule (§5.3).
  - **No timers anywhere**: turn timer, matching timer, reaction window and auto-throw/away logic all removed.
  - Targets end when the next player draws (§5.5); several matches per player per throw allowed.
  - A disconnect cancels an attempt with no penalty (replaced in v0.6 by pause-and-wait); a give-up counts only flipped cards.
  - Others see the power cursor.
  - Reshuffle only when the deck is empty (§7.3); a no-winner end only when no card exists anywhere.
  - Friends key required to create rooms; text chat + voice notes (§10.5); no screenshot protection.
  - Players choose their 2 peek cards; characters picked before each game, duplicates allowed, 3 placeholder characters (§14.6).
  - Bots for everyone, host test tools, owner-only Test room (§17); phone default seat view; PWA (iPhone, Android) + Windows .exe.
- v0.6 (21 Oct 2026): **disconnects pause and wait, with no timer** (Ammar's decision; §10.4).
  - If a player disconnects or closes the app, the game pauses for everyone and the seat shows "disconnected — waiting". He can rejoin whenever he wants and resumes exactly where he was, including an in-progress match attempt (flipped cards and tentative set preserved).
  - Nothing happens automatically. The host has optional manual buttons: replace with bot, remove player, end game. The game ends only if the host ends it, everyone leaves, or the room expires after a long technical idle limit.
  - **No game timers anywhere.** A 60 s reconnect grace was considered and dropped. This replaces the v0.5 rule that a disconnect cancels the attempt.

---

# 1. Summary

| Item | Decision (proposal) |
|---|---|
| What | A private, browser-based, real-time multiplayer version of Ammar's house rules of *Screw* (سكرو), for 2–4 friends |
| Visual reference | **Liar's Bar** (Steam, Curve Animation) for **camera and animation feel only**: a first-person seat at the table, hands and cards in the foreground, characters reacting. The **mood is our own**: a warm, cosy, friendly back room with tea and cards (§14). All art is original; nothing is copied from the game |
| Platforms | Any modern browser, installable as a web app (PWA) on **iPhone** and **Android** (RESOLVED Q24), plus a **Windows desktop .exe** built by GitHub Actions |
| Frontend hosting | **GitHub Pages** (free), repo under `heisenberg0066`, deployed by GitHub Actions |
| Game server | **Cloudflare Worker + one Durable Object per room** on the **Workers Free plan**, using the open-source `partyserver` library (optional). The server is authoritative and holds all hidden cards |
| Security model | Clients get only what their player may see ("per-player projection"). Every hidden card value stays on the server. The host has no special view |
| Privacy / access | No public matchmaking and no room list. **A friends key (password) is required to create rooms** (RESOLVED Q14); rooms are joined by code or invite link, with an optional join password |
| Accounts | None. The player picks a nickname and an avatar; the device keeps a random secret seat token for reconnecting |
| Languages | **English + French** (each player picks their own); card names English only (J/Q/K/A) |
| Chat | Emojis, preset phrases, free text and **voice notes** (≤30 s, relayed live, never stored after the match) (§10.5) |
| Timers | **None** (RESOLVED Q5, v0.6). A disconnect pauses the game until the player rejoins, with no countdown (§10.4) |
| Cost | 0 kr. No paid AI. Bots are plain rule-based code |
| Solo / test | Bots for everyone (offline practice, or added to any room by its host), host test tools in any room, and an **owner-only Test room** with reveal-all and deck forcing (§17, RESOLVED Q22). Delivered in **Phase 1** |
| Name | **MarLivo** (RESOLVED Q1): Ammar + Liv/"Livooo". Slug `marlivo` |

---

# 2. Game name

**RESOLVED (Q1): the game is called MarLivo** (exact casing: capital M, capital L). It combines **Ammar** and his best friend **Liv** ("Livooo"); see Appendix A.
- Slug for URLs, the repo and the Worker: `marlivo`. Repo `heisenberg0066/marlivo`, app `https://heisenberg0066.github.io/marlivo/`, server `marlivo.<account>.workers.dev`.
- Always written **MarLivo** in the UI, docs and store-like texts. Only lower case `marlivo` in technical identifiers.

---

# 3. Confirmed rules (RULE), restated for the engine

These are exactly the rules Ammar confirmed, written precisely enough to program. Generic Screw rules are **not** included: there is no "calling Screw" and no lowest-total scoring.

## 3.1 Setup
- **R1** 2–4 players, each playing for themselves.
- **R2** One standard 52-card deck, no jokers. Values: A=1, 2–10 = face value, J=11, Q=12, K=13. Suits have no effect on the rules (they are shown for looks only).
- **R3** Cards per player is set at game creation. Default **6**, allowed range **4–8**. With 4 players × 8 = 32 cards, 20 cards are still left for the deck, penalties and the 10-power.
- **R4** Cards are dealt face down into each player's area.
- **R5** At the start, each player privately peeks at **exactly 2** of their own cards. The cards then go back face down. From then on it is a memory game.

## 3.2 Turn
- **R6** The starting player begins, and turns pass clockwise in seat order from them. **Who starts (RESOLVED Q3):** in the **first round of a match**, every player rolls a six-sided die (an animated roll on the table). The highest roll starts; if several tie for highest, only they roll again until one remains. In **every later round of the same match**, the **previous round's winner** starts. Below, "player 1" in Ammar's rules means "the starting player".
- **R7** The current player draws the top card of the deck. Only the drawer sees it.
- **R8** The drawer then does exactly one of these:
  - **Throw**: put the drawn card face up on the discard pile.
  - **Blind swap**: pick one of their own face-down positions *without looking at it*. The drawn card goes face down into that spot; the drawer knows it, the others don't. The removed card is revealed and thrown face up on the pile.

## 3.3 Special powers
- **R9** A power triggers **whenever that card lands on the pile, by any route**: thrown after drawing, swapped out, or thrown as part of a match or combination.
- **R10 Jack (11)**: *optional*. Swap **any two face-down cards** on the table (RESOLVED Q10): one of your own with an opponent's, two cards of two other opponents (3–4 players), or two cards of the same player (yours or an opponent's). Nobody sees the values.
- **R11 Queen (12)**: look privately at one card on the table, your own or an opponent's. *Optional* (RESOLVED Q11), but the UI makes peeking the obvious default choice.
- **R12 King (13)**: no power.
- **R13 Ten (10)**: give one extra penalty-style card (face down from the deck, unseen by everyone) to an opponent. With 2 players it goes to the other player automatically; with 3–4 the thrower chooses. **Mandatory** (RESOLVED Q11): the thrower must give the card; there is no skip.
- The power belongs to **the player who threw that card**.

## 3.4 Matching (the core twist)
- **R14** Whenever a card is thrown on the pile, **any** player, in turn or out of turn, may throw cards from their own area that match its value. That can be **one card of equal value**, or **several of their own cards whose values sum exactly** to it.
- **R15** Several players may match the same throw, and matches stack: a 9 is thrown, a friend throws a 9, then I throw 5+4. **All matches on a throw target that throw's value** (RESOLVED Q6). **One player may match the same throw several times**, one attempt after another (e.g. a 9, and then 5+4) (RESOLVED Q7).
- **R15b** Once the next player draws, the previous throw's window is closed and a new target begins with the next throw. **A drawn card can never be thrown as a match onto the previous throw, nor combined with it** (RESOLVED Q6).
- **R16** Cards in a match attempt are flipped **one at a time** and revealed to everyone.
- **R17 Wrong card (RESOLVED Q2)**: a flipped card is **wrong if it does not end up in the final exact combination**. Any card that doesn't fit counts. Each wrong card = **2 penalty cards** (face down from the deck, unseen by everyone). Wrong cards go back **face down into their own spot**; everyone has now seen them.
- **R18 Correcting**: the player may keep flipping to correct the attempt; only the wrong cards are penalized. *Ammar's example (target 12):* the attempt is completed with 3 cards, but 6 cards were flipped in total. 3 wrong → **6 penalty cards**.
- **R19 Giving up / running out**: if the player gives up, or runs out of cards to flip, without reaching the exact target, **all flipped cards are wrong**, but only cards actually flipped count (RESOLVED Q8). *Examples:* target 12: 7, 3, 4, then give up → 3 wrong → 6 penalty cards. Target 9, trying 4+5: flips the 5, then gives up → 1 wrong → 2 penalty cards.
- **R20** Penalty cards are dealt **at the end of the attempt**, all together (§3.6). A single wrong card gives 2.
- **R21** Matching has **no time limit**, and there are **no timers anywhere** in the game (RESOLVED Q5, v0.6). A disconnected player simply pauses the game (§10.4). The matching window and turn advancement are defined in §5.
- **R22** A special card thrown in a successful combination still grants its power. *Example:* a King (13) is matched with J+2, so the matcher gets the Jack swap.

## 3.5 End of round, scoring, deck
- **R23** The round ends **immediately** when any player has zero cards.
- **R24 Tie-break / the only priority** (RESOLVED Q4): matching is first come, first served (server arrival order). The single exception: if the turn player and someone else could both finish (empty their area) on the same throw, **the turn player wins**. How the server applies this without leaking cards or using timers is in §5.3.
- **R25** A player may finish **out of turn** by matching on someone else's throw (for example, they hold only a Jack and a Jack is thrown).
- **R26** The round winner gets **1 point**. The match goes to the first player to reach the **target points** set at creation (e.g. 5, 7, 11).
- **R27** The deck is reshuffled **only when it is completely empty** and a card is needed (a draw, a penalty card or a 10's card). The thrown pile is shuffled into a new deck, **keeping on the pile the current target card and any cards of an open match** (RESOLVED Q13), and play continues normally (RESOLVED Q25). The round ends with **no winner** only if truly no card exists anywhere outside the players' areas (§7.3).

## 3.6 Match attempt mechanics (RESOLVED Q2; revised in v0.7 by Ammar)

There is one model for both singles and combinations; the player never says in advance which one they are attempting.

- An attempt has a **target T**. The cards currently **face up** form the set, with sum **S**.
- Actions during an attempt (no timers, nothing happens on its own):
  1. **Flip** one of your face-down cards. It turns face up **and stays face up, visible to everyone**, until the attempt ends, whatever its value (S may go over T).
  2. **Turn back**: tap a face-up card to turn it face down again. It stays in its spot. Since it was flipped, it counts as **wrong** unless it is flipped again and is part of the final set.
  3. **Done** (Match): submits the face-up set. Accepted only if S = T (one card or a sum); otherwise the server refuses and the attempt simply stays open.
  4. **Stop matching** (give up): every flipped card is wrong; all go back face down.
- Nothing ends an attempt except Done, Stop, or the host replacing/removing the player. There is no auto-fail when every card is face up.
- **Completion**: the face-up set (sum = T) is played to the pile. **Every other card flipped during the attempt** is wrong.
- **Penalty** = 2 cards per wrong card, dealt **once, at the end of the attempt**, as one sequence. During the attempt a counter shows "Penalty due: +4".
- Checks:
  - T=13: flip 7, 2, 5 (S=14, too much), turn the 2 back, flip 1 → 7+5+1 = 13, Done. Valid; the 2 was wrong → 2 penalty cards. ✔ (Ammar's example, v0.7)
  - T=12: flip 7, turn it back, flip it again, flip 5, Done → 7+5, no penalty (the 7 is in the final set).
  - T=12: complete with 3 cards after 6 flips → 3 wrong → 6 penalty cards. ✔
  - T=12: 7, 3, 4, Stop → 3 wrong → 6 cards; all three back face down.
  - T=9: flip a 9, Done. No penalty. T=9: flip a K, Stop → 2 cards.
  - T=9: 5, 2, 1 face up (S=8) with no cards left: the attempt stays open; Done is refused; Stop → 6 cards.
  - Stop before the first flip: free.
- **UI tap safety** (v0.7, not a timer): a button that has just appeared ignores taps for a moment (and while a finger keeps hammering the bar), a fast double tap on one card counts once, and tapping the pile never throws (only the Throw button does). This fixes attempts/draws that "closed by themselves" when stress-tapping.
- **Disconnect** during an attempt (v0.6): the game pauses for everyone and **waits with no time limit**. When the player rejoins, the attempt **continues exactly where it was**: flipped cards, tentative set and penalty-due count are all preserved. The attempt is cancelled only if the host **replaces** or **removes** that player. It is then cancelled with **no penalty**: every flipped card goes back face down (already seen by everyone). Penalties are only ever applied when an attempt ends normally.
- **Cancel**: before flipping any card, the player may cancel the claim with no penalty (RESOLVED Q26).

## 3.7 Facts that follow from the rules
- **At most one J/Q power per combination.** Every combination sums to ≤13, and J+Q, J+10 and Q+10 all exceed 13. Possible special mixes: one J *or* one Q *or* one 10, plus small cards (e.g. 10+2+A = 13 holds one 10). This makes power ordering simple (§5.6).
- **A card count only changes through matching (−), penalties (+) and the 10-power (+).** Draw/swap and the Jack swap never change counts, so the **only way to reach zero cards is a successful match.** Many feared edge cases (a player hitting 0 through a Jack swap, a 10 aimed at a player with 0 cards) therefore cannot happen, because the round has already ended (§20).

---

# 4. Rules engine: state machine

## 4.1 Architecture of the engine
- A **pure, deterministic TypeScript module** (`/packages/engine`). Input: `(state, action, rng)`. Output: `(newState, events[])`. No network, no timers, no randomness except through the injected RNG.
- The **same engine** runs in three places:
  1. On the server (Durable Object): the authoritative copy for real games.
  2. In the browser, inside a Web Worker acting as a local "server": offline solo practice (§17).
  3. In tests and simulations (§21).
- There are **no gameplay timers** (RESOLVED Q5, v0.6). The engine only reacts to player intents and has a `PAUSED` flag that is set while any seat is disconnected during a round. Technical housekeeping outside the engine (the long room-idle expiry, reconnect backoff, heartbeats, rate limits) never changes the game state.

## 4.2 Match-level states

```
LOBBY ─start─▶ START_ROLL ─▶ ROUND_SETUP ─▶ DEALING ─▶ PEEK ─▶ PLAY ─▶ ROUND_END
              (round 1 only)      ▲                                      │
                                  └─── nobody at target (winner starts) ─┤
                                                 someone at target ──▶ MATCH_END ─▶ LOBBY
                                                                       (rematch = new match, new dice roll)
```

| State | What happens | Exit |
|---|---|---|
| LOBBY | Players join, choose seats, host edits settings, everyone toggles Ready | Host presses Start; needs ≥2 players, all Ready |
| START_ROLL | Round 1 of each match only: every player taps "Roll" for a d6 (bots roll themselves). The server's RNG decides, and all rolls are revealed together. Ties for highest re-roll among the tied (§4.5) | One unique highest roll; that player starts |
| ROUND_SETUP | Server builds and shuffles a fresh 52-card deck (crypto RNG), publishes a shuffle commitment hash (§11.2, item 6), sets the starting player (dice winner in round 1, the previous round's winner afterwards) | Automatic |
| DEALING | Server deals N cards to each seat, one at a time in seat order from the starter (clients animate it) | Automatic after the deal animation time (~0.12 s per card, capped) |
| PEEK | Each player picks **any 2** of their own cards to see (RESOLVED Q18) | All players have pressed "Memorized" (no time limit) |
| PLAY | The turn loop (§4.3) | A player reaches 0 cards (R23), or a stalemate (§20 E10) |
| ROUND_END | **All remaining cards are revealed to everyone** (RESOLVED Q16), the winner +1, the scoreboard animates. If no card existed anywhere when one was needed, the round ends with no winner (§7.3) | Everyone presses "Next round" |
| MATCH_END | Trophy screen, stats, rematch | Rematch goes back to LOBBY with the same settings; it starts with a new dice roll |

## 4.3 PLAY sub-states (turn loop)

```
                    ┌──────────────────────────────────────────────────────┐
                    ▼                                                      │
 AWAIT_DRAW(cur) ──draw──▶ DECIDE(cur, drawnCard)                          │
                                │throw            │swap(slot)              │
                                ▼                 ▼                        │
                         LAND(card, by=cur, source=throw|swapOut)          │
                                │                                          │
                                ▼                                          │
                  ┌──▶ RESOLVE_QUEUE ◀──────────────────────────┐          │
                  │   (powers waiting? match claims waiting?)    │          │
                  │      │power             │claim granted       │          │
                  │      ▼                  ▼                    │          │
                  │  POWER(owner, kind)   MATCH_ATTEMPT(player,T) │          │
                  │      │done/skip         │flip/remove/done/quit            │
                  │      └──────────────────┴──────▶ LAND(each accepted card)│
                  │                                              │          │
                  └──── nothing waiting ──▶ OPEN_WINDOW(T) ──────┘          │
                                               │ next player presses Draw   │
                                               │ (allowed when nothing is    │
                                               │  pending; no timers)        │
                                               └────────────────────────────┘
```

- **AWAIT_DRAW(cur)**: only `cur` may draw. Other players may still match the *previous* throw while its window is open (§5).
- **DECIDE**: the drawn card is shown only to `cur`. Allowed actions: `THROW` or `SWAP(slotId)`. Nobody else can act on the table during DECIDE, except an emoji reaction. Reason: the window of the previous throw closed the moment `cur` drew.
- **LAND**: a card lands face up on the pile. Each landing **(a)** sets or keeps the match target and **(b)** queues the card's power if it is J/Q/10. There is no reaction window (RESOLVED Q4/Q5).
- **RESOLVE_QUEUE**: the single serialized scheduler. Exactly one "table action" runs at a time: either a power resolution or a match attempt.
- **OPEN_WINDOW(T)**: idle, with the target still open. Anyone may claim a match (server arrival order). The next player may press Draw as soon as nothing is pending.
- **Round end check**: after every LAND batch, every penalty deal and every Jack swap, the engine checks for players with 0 cards. Because of §3.7 this can only fire after a successful match. If the turn player emptied their area, the round ends at once. If **another** player did, the engine first enters **FINISH_PENDING** so the turn player can use the R24 priority (§5.3). When the round ends, pending powers and queued claims are discarded.

## 4.4 State data model (sketch, not code)

```
Room { code, passwordHash?, settings, seats[0..3], phase, scores{seatId:int}, roundNo, lastRoundWinner?, startRolls?{seatId:int[]}, log[] }
Seat { seatId, name, characterId, lang, connected, isBot, botLevel?, ready, tokenHash }
Round {
  deck: CardId[]              // server only
  discard: CardId[]           // public (face up)
  areas: { seatId: Slot[] }   // slot positions are public; card values are server only
  current: seatId
  sub: AWAIT_DRAW | DECIDE | RESOLVING | OPEN_WINDOW
  drawn?: CardId              // server + current player only
  window?: { target:int, triggerCardId, openCardIds[] }   // closes when the next player draws
  finishPending?: { finisher: seatId }                    // R24 hold, §5.3
  queue: [ Power{owner,kind,cardId} | Claim{seatId, at} ]
  attempt?: { seatId, target, sum, tentative[slotId], wrong[slotId], flipped[slotId], penaltyDue }
  knowledge: { slotId: Set<seatId> }   // who has legitimately seen which card (bots + optional helper)
  commitment: sha256(deckOrder ‖ salt)
}
Slot { slotId (stable, e.g. "S2-05"), cardId | null, gridIndex }
Card { cardId (random per round), rank 1..13, suit }   // never sent to a client unless visible to that client
```

## 4.5 Starting player (RESOLVED Q3)
- **Round 1 of a match: dice roll.** After Start, a die sits in front of each seat. Players tap "Roll" (no auto-roll and no timer; bots roll after a short delay). The server's crypto RNG decides each value and the clients only animate it. Rolls are **revealed together** once everyone has rolled, so nobody can wait and react.
- The highest roll starts. If several tie for highest, **only the tied players** roll again ("Tie! Sara and Omar roll again"), repeating until one remains.
- **Later rounds of the same match:** the previous round's winner starts.
- If the previous winner has left the match, the next active seat clockwise from them starts.
- A **rematch** is a new match, so it starts with a new dice roll.
- Turn order is always clockwise by seat from the starting player. The host can still arrange seats in the lobby ("Shuffle seats"); seats set the order, and the dice only pick who begins.

## 4.6 Seat order / direction
- Clockwise around the table as seen on screen, which matches seat numbers 1→2→3→4.
- On each player's own screen the next player is always shown to their left.

---

# 5. Match windows, turn advancement and race conditions

There is no time limit, and players act out of turn, so this part needs precise rules. Every rule here follows Ammar's v0.5 answers.

## 5.1 Principles
1. **One table action at a time.** The server serializes everything. Two people can never be mid-flip at the same moment. This keeps every reveal readable and makes Jack swaps safe.
2. **Matching stays open until the next player draws** (R15b). There are **no timers** (RESOLVED Q5).
3. **No matching priority** (RESOLVED Q4). Everyone matches freely; simultaneous claims are ordered by **server arrival**.
4. **The only priority is the turn-player finish rule** (R24, §5.3).

## 5.2 The "Match" button
- A large button with a pulsing outline, shown to **every** player whenever a target is open. Label: **"Match 9"**, showing the target value (in French: **"Assortir 9"**, wording to be checked by Ammar, §15).
- Also: **long-press any of your own cards** (phone) or press **M** (laptop) to claim a match.
- After pressing it you are either:
  - **granted** (your cards glow and become flippable), or
  - **queued**: "You're #2 in line, Sara is matching…", with a Cancel button.
- **Cancel** is free before your first flip, whether you're queued or granted (RESOLVED Q26).
- After finishing an attempt you may claim again on the same throw (RESOLVED Q7); you join the back of the queue.
- If the window closes while you are queued (the next player drew), you get "Window closed" with a soft sound, and nothing is charged.

## 5.3 Claim order and the turn-player finish rule (RESOLVED Q4)
- **Claim order**: pure **server arrival order**. Each Durable Object processes messages one at a time, so there are no true ties [GK]. The turn player gets **no** head start and no reserved slot.
- **Turn-player finish rule (R24)**. Let **C** be the turn player (whose turn produced the current throw):
  1. C completes an attempt that leaves C with 0 cards: **C wins at once**.
  2. Another player **X** completes an attempt that leaves X with 0 cards: X's cards are played and shown, but the round **does not end yet**. The server enters **FINISH_PENDING(X)**: "Omar has emptied his area. Sara (turn player) may try to finish first."
  3. C chooses **Try to finish** or **Let Omar win**. There is **no timer**; the table waits. The choice is offered **every time** this happens, whatever C's cards are, so it reveals nothing about C's hand.
  4. *Try to finish*: C runs a normal attempt on the same target. If it leaves C with 0 cards, **C wins** the round. Otherwise (complete with cards left, a give-up, or no exact set), **X wins**. The round is over either way, so no penalty cards are dealt.
  5. *Let X win*: X wins.
  6. Other queued claims are discarded when FINISH_PENDING starts. Only C has this right.
  7. If C is disconnected, the game pauses and waits for C (no timer). The host may optionally replace C with a bot (the bot then decides) or remove C (X then wins).
  8. Bots as C try only when their known cards make an exact finish; otherwise they let it go.
- This implements "if the turn player and someone else could both finish on the same throw, the turn player wins" without the server ever leaking C's cards and without any timer.

## 5.4 Advancing the turn
- The next player's **Draw** button becomes active as soon as **all** of these hold:
  - no power is resolving or waiting;
  - no match attempt is in progress or queued;
  - no FINISH_PENDING.
- There is **no reaction window and no turn or matching timer** (RESOLVED Q4/Q5). The only natural pause is the landing animation itself (~0.5 s, pacing from §9.3, not a game timer). Friends are expected to give each other a moment; the next player can also wait as long as they like.
- Drawing **closes** the window. Claims that arrive after the draw are rejected with "Too late". The drawn card can never match the previous throw or be combined with it (R15b).

## 5.5 Targets (RESOLVED Q6)
- The **target T** is the value of the card that opened the window, the **trigger**: the thrown card or the swapped-out card.
- **All matches on that throw target T.** A 9 is thrown, a friend matches with a 9, I match with 5+4, and I match again with 6+3: all of them match against T=9.
- Cards played in a match never open new targets of their own.
- Once the next player draws, that window is gone. The next throw starts a new target.

## 5.6 Order of powers and matches when things stack
The queue is **FIFO with one rule: a power waiting in the queue runs before the next match claim is granted.**

1. A card lands. If it is J/Q/10, a `Power(owner=thrower)` goes to the **front of the non-power part of the queue**, i.e. it resolves before any queued match claims.
2. A match attempt completes: its accepted cards land **one by one in flip order**. Any J/Q/10 among them queues a power for the matcher (at most one per combination, §3.7). Single-card matches count as well: matching a Queen with a Queen gives the matcher a peek.
3. The engine checks for zero cards (§4.3, §5.3). If the round ends, the power is not used.
4. Powers run before the next claimed match. The Jack thrower therefore gets to shuffle things *before* a waiting matcher flips, which fits the "confuse them" intent. The queued matcher sees the swap animation before their turn to flip starts.
5. With two powers pending (e.g. a 10 matched by a 10, so both thrower and matcher have the 10-power), they resolve in **landing order**.
6. A power may target a player who is queued to match. That's allowed; it is part of the chaos.
7. Penalty cards from wrong flips are dealt **at the end of the attempt** (R20), as part of the attempt itself (not queued), so the area is complete before anyone else acts.

**Worked example 1.** P1's turn, 3 players. P1 draws a Q and swaps it into slot 4. The removed card is a J and lands, so T=11.
- Power(J, P1) goes first. Claims arrive in this order: P3, P1, P2. Queue: Power(J, P1), P3, P1, P2.
- P1 uses the Jack: swaps P2's slot 1 with P3's slot 3.
- P3 flips 8 (tentative), then 4: 8+4 overshoots 11, so the 4 returns at once as wrong. P3 gives up, so the 8 is wrong too. 2 wrong → 4 penalty cards, dealt when the attempt ends.
- P1 flips slot 2: it is a J. Success; it lands, which queues Power(J, P1) ahead of P2's claim. P1 swaps again.
- P2 flips 6, then 5 = 11. Success. P2 claims again (Q7) and plays 9+2 = 11. Success.
- The queue is empty, so P2 (next in turn) may draw. Drawing closes the T=11 window.

**Worked example 2 (finish rule).** P1's turn. P1 throws a 7. P2 has one card left, a 7, and claims first: P2 now has 0 cards, so FINISH_PENDING(P2). P1 chooses **Try**, flips his last card, and it is a 7: P1 has 0 cards, so **P1 wins**. Had P1's card been a 6, P2 would win.

## 5.7 Simultaneous-action conflicts (server ordering)
| Conflict | Ruling |
|---|---|
| Two claims at (almost) the same time | Server arrival order, no priority (RESOLVED Q4) |
| Claim arrives after the next player drew | Rejected: "Too late" |
| Draw pressed while a claim is in flight | Whichever reaches the server first wins. If the claim arrives first, the draw is rejected ("Someone is matching") |
| Claim by a player whose cards a Jack is about to swap | Allowed. The claim waits, the swap happens, then they flip |
| Turn player and another player could both finish | §5.3 finish rule: the turn player wins if they actually finish |
| A player disconnects while holding the match lock | The game **pauses for everyone and waits, with no time limit** (v0.6). On rejoin the attempt **resumes unchanged** (flipped cards, tentative set, penalty due). Only a host **Replace with bot** or **Remove player** cancels it, with no penalty; every flipped card goes back face down |
| A player disconnects with a power pending | Paused; waits for them. On rejoin they resolve the power as normal. If the host replaces them with a bot, the bot resolves it; if the host removes them, the power is lost |
| A second player drops while the game is already paused | The game stays paused until every disconnected player is back, or the host has replaced or removed them |
| Several tabs of the same player | The newest connection wins; the old tab shows "Opened elsewhere" |

---

# 6. Power flows (J, Q, 10) in detail

All power UIs are shown **only to the power's owner**. Everyone else sees a status banner ("Omar is using the Jack…") and **the owner's targeting hand/cursor moving over the table in real time** (always on, RESOLVED Q9).

## 6.1 Jack: swap two face-down cards (optional)
1. A toast for the owner: "Jack! Swap two cards, or skip."
2. Every face-down slot on the table gets a thin gold outline. The owner taps card A, which lifts 8 px and gets a gold chain icon. They tap card B, which also lifts.
   - Tapping A again deselects it.
   - Any two face-down cards (RESOLVED Q10): your own + an opponent's, two different opponents' cards (3–4 players), or two cards of the same player (yours or an opponent's).
   - Tentative cards (mid-attempt) are not selectable; the case can't arise anyway, because powers never run during an attempt.
3. A **Confirm swap** button (or double-tap B), plus **Skip**.
4. The server swaps the slot contents. **Positions are public, values stay secret.** Everyone sees the animation: both cards rise, cross in an arc, and land in each other's slot.
5. Knowledge tracking moves with the card (if you knew card A, you now know it sits in B's slot). This feeds bots and the optional memory helper.

## 6.2 Queen: peek at one card
1. A toast for the owner: "Queen! Look at any one card." All face-down cards get a soft blue outline.
2. The owner taps a card. On the owner's screen it **tilts up toward the camera** (a hand-shielded peek). Its value stays visible until they tap **Done** or tap the card again (no timer).
3. Others see **who** peeked at **which slot**: the card lifts slightly at a tilt with its back toward them, and an eye icon appears on that slot for 2 s. They never see the value.
4. **Optional, with peeking as the obvious choice (RESOLVED Q11).** Peeking is the primary action: all cards glow, a big "Tap a card to peek" prompt shows, and the cursor is a pulsing eye. **Skip** is only a small text link in the corner, and it asks again ("Skip your peek?") so nobody skips by accident.

## 6.3 Ten: give a penalty card to an opponent
1. **2 players**: automatic. The deck's top card flies face down into the opponent's area, with a "+1" badge.
2. **3–4 players**: the owner sees the opponents' areas highlighted and taps one. **Mandatory** (RESOLVED Q11): there is no Skip button. If the owner disconnects, the game pauses until they rejoin. If the host replaces them with a bot, the bot picks the opponent.
3. The card goes into that player's area according to the slot-placement rule (§7.2). Nobody sees its value, not even the giver.
4. If the deck is empty, it is reshuffled first (§7.3). If no card exists at all, the power fizzles (§20 E9).

**RESOLVED Q9:** others always see the power-user's hand or cursor hovering over cards in real time (cursor updates are throttled to 10 Hz).

---

# 7. Penalties, slots and the deck

## 7.1 Penalty cards
- Each wrong card gives +2 cards. They are dealt **at the end of the attempt** (R20) in one sequence from the deck: face down, unseen, flying one after the other (§16).
- Every penalty card is unknown to everyone, its owner included. That is the point.
- Running penalty stats are recorded for the end-of-match "Hall of Shame" (§13.11).

## 7.2 Slot placement (memory-critical, RESOLVED Q12)
Positions must stay **stable**, or memory becomes impossible.
- Each player's area is a **logical grid** defined by the server (rows × columns). It's identical on every screen; devices only scale it. Default starting layout: 2 rows (4 → 2×2, 5 → 3+2, 6 → 2×3, 7 → 4+3, 8 → 2×4). Max row length 6. **v0.7:** each player picks their own starting layout before the match (single line, 2 rows, 3 rows, 4 rows; only even splits or 2 rows, rows of 2–6), shown with a mini preview in the solo setup and the lobby; locked once play starts.
- When a card leaves through a successful match, **its slot stays as an empty gap** (a faint outline). Remaining cards **never shift**.
- New cards (penalty or 10-power) go:
  1. **first into empty gaps** in the player's layout, in reading order (first gap first);
  2. when no gaps are left, into a **random extra position**: the server picks a random row and appends a new slot at that row's end. If every row is at max length, a new row starts. The choice is server-random and public; everyone sees where it lands (a new slot outline fades in just before the card arrives).
- Several penalty cards from one attempt are placed one by one with this rule.
- Slots get small, subtle position numbers (1, 2, 3…), so a player can say "I think his 4 is a King". Toggle in settings, default ON. Numbers follow the logical grid; an appended slot takes the next free number.

## 7.3 Deck reshuffle (R27, RESOLVED Q13 + Q25)
- A reshuffle happens **only when the deck is completely empty** and a card is needed: a draw, a penalty card or a 10-power card.
- The thrown pile is shuffled into a new deck. **The current target card and any cards of an open match stay on the pile.** Play then continues normally (a penalty sequence simply carries on with the new deck).
- Animation: the pile sweeps into the deck spot with a riffle sound, and a "Reshuffled" chip appears.
- **Truly no cards anywhere**: if a card is needed, the deck is empty and the pile holds nothing that can be reshuffled, the server takes the kept target and open-match cards too, as a last resort. The target value stays active and is shown as a badge. Only if the deck **and** the pile are both completely empty does the round **end with no winner** (no point; the next round starts normally, with the previous round's starter starting again). This needs nearly all 52 cards in players' areas, so it's theoretical.

---

# 8. Hosting options (free, private)

Requirements: **free with no card on file**, keeps **hidden information** secret (needs an authoritative referee that players can't inspect), works on iPhone Safari and Windows, survives a phone briefly going to the background, and stays simple to deploy from GitHub Actions.

| Option | Cost model | Hidden-info security | Reliability for this use | Effort | Verdict |
|---|---|---|---|---|---|
| **Cloudflare Workers + Durable Objects (Free plan)** | Free plan includes SQLite-backed DOs: **100,000 requests/day, 13,000 GB-s/day**. Incoming WebSocket messages are billed at 20:1, outgoing messages are free, and **hibernation avoids duration charges** while sockets idle [S: developers.cloudflare.com/durable-objects/platform/pricing]. Over the limit, operations fail instead of being billed [S] | ✅ Server-authoritative. Clients only see what we send | ✅ One DO per room gives single-threaded, strictly ordered processing, ideal for the race rules in §5. Room state persists in SQLite, so a reconnect survives a DO restart | Medium: `wrangler deploy` from GitHub Actions | **RECOMMENDED** |
| **PartyServer** (successor to PartyKit, on your own Cloudflare account) | Same as above (it *is* DOs). The hosted PartyKit platform and `npx partykit deploy` shut down on **23 Oct 2026**; new projects should use `partyserver` + `wrangler` [S: docs.partykit.io/guides/migrate-to-partyserver, blog.partykit.io] | ✅ same | ✅ same, plus convenience: rooms, broadcast, hibernation, auto-reconnecting `partysocket` client | Lower: less boilerplate | **Use as the library on top of the recommendation** (optional) |
| **Firebase Spark (free)** | Realtime DB on Spark: **100 simultaneous connections** cap. **Cloud Functions require the paid Blaze plan** [S: firebase.google.com/docs/functions/quotas, …/pricing-plans] | ❌ Without server code, the shuffled deck must live in the database where the clients can read it. Security rules can't do an authoritative shuffle and selective reveal | OK | Low | **Rejected**: it can't keep cards secret on the free plan |
| **PeerJS / WebRTC P2P, host's browser is the server** (frontend on GitHub Pages) | Free. PeerJS has a free public signaling server [GK]. Some networks need a TURN relay, and free TURN is limited [GK] | ⚠️ The host's browser holds every card, so the host can read them with DevTools | ⚠️ iPhone Safari suspends background tabs: if the host's phone locks, the game freezes for everyone. NAT failures on 4G | Medium-high | **Fallback only** (e.g. "LAN party mode" later) |
| Supabase free (Edge Functions + Realtime) | Free tier; projects **pause after inactivity** [GK, verify] | ✅ possible with Edge Functions | ⚠️ cold starts, the pause/resume chore, more moving parts | High | Not recommended |

**Recommendation: frontend on GitHub Pages, game server on a Cloudflare Worker with one Durable Object per room (Workers Free plan), optionally written with `partyserver`.**

Why:
1. It's the only free option that is **truly authoritative**, which hidden-card security requires.
2. Durable Objects process one message at a time per room, giving a deterministic order for the matching races.
3. Cost estimate [GK, rough]: one round ≈ 200–600 client messages. With the 20:1 ratio that's ~10–30 billed requests per round, so the 100k/day budget is far beyond what a friend group will use. Use the **WebSocket Hibernation API** so idle rooms cost no GB-s.
4. No credit card. Cloudflare's free account is enough; the Worker URL is `marlivo.<account>.workers.dev`.

**What Ammar needs to do once**: create a free Cloudflare account and run `wrangler login` (or add a `CLOUDFLARE_API_TOKEN` secret to the GitHub repo so Actions can deploy). I can't do that step for him.

---

# 9. Network protocol (WebSocket, JSON)

## 9.1 Client → server intents
`HELLO{roomCode, seatToken?, name, characterId, lang, password?}` · `CREATE_ROOM{friendsKey, ownerKey?, test?}` · `PICK_CHARACTER{id}` · `SET_READY` · `HOST_UPDATE_SETTINGS{…}` · `HOST_SEAT_MOVE` · `HOST_KICK` · `START` ·
`PEEK_PICK{slotId}` · `PEEK_DONE` · `HOST_ADD_BOT{level}` · `HOST_REMOVE_BOT{seatId}` · `HOST_REPLACE_WITH_BOT{seatId}` · `HOST_REMOVE_PLAYER{seatId}` · `HOST_END_GAME` · `LEAVE_GAME` ·
`DRAW` · `THROW` · `SWAP{slotId}` ·
`ROLL_DIE` · `CLAIM_MATCH` · `CANCEL_CLAIM` · `FLIP{slotId}` · `REMOVE_TENTATIVE{slotId}` · `GIVE_UP` · `FINISH_TRY` · `FINISH_LET_WIN` ·
`JACK_SWAP{slotA, slotB}` · `JACK_SKIP` · `QUEEN_PEEK{slotId}` · `QUEEN_DONE` · `QUEEN_SKIP` · `TEN_GIVE{seatId}` ·
`NEXT_ROUND` · `REMATCH` · `EMOTE{id}` · `CHAT_TEXT{text}` · `VOICE_NOTE{mime, durationMs, bytes}` (binary frame) · `CURSOR{x,y}` (throttled to 10 Hz, during powers) · `TEST_*{…}` (Test room + owner key only, §17.3) · `PING`

Every intent carries a client sequence number `cseq`. The server echoes it with **ACK** or **REJECT{reason}**, so the UI can roll back optimistic hover effects. The engine is authoritative; the client never assumes success.

## 9.2 Server → client events
- `SNAPSHOT{view}`: the full per-player view, sent on join or reconnect.
- `EVENT{seq, type, publicData, privateData?}`: an ordered stream. `privateData` is present **only** in the copy sent to the player entitled to it.
- Event types: `DICE_ROLLED(rolls, tiedSeats?)`, `STARTER(seatId, reason: dice|lastWinner)`, `DEALT`, `PEEK_REVEAL(private)`, `PEEK_HIDE`, `DREW(public: who; private: card)`, `THROWN(card)`, `SWAPPED(slotId, outCard)`, `LANDED(card, by)`, `WINDOW_OPEN(T)`, `WINDOW_CLOSED`, `CLAIM_QUEUED(order[])`, `ATTEMPT_START`, `ATTEMPT_CANCELLED(seatId)`, `PAUSED(seatIds[])`, `RESUMED`, `GAME_ENDED_BY_HOST`, `FINISH_PENDING(finisher, turnPlayer)`, `FINISH_RESOLVED(winner)`, `FLIPPED(slotId, card, verdict: tentative|wrong|complete)`, `TENTATIVE_REMOVED(slotId)`, `ATTEMPT_END(result, played[], wrong[], penaltyCount)`, `PENALTY_DEALT(seatId, slotIds[])`, `POWER_START(owner, kind)`, `JACK_SWAPPED(slotA, slotB)`, `QUEEN_PEEKED(public: owner, slotId; private: card)`, `TEN_GIVEN(to, slotId)`, `RESHUFFLED(deckCount)`, `ROUND_END(winner, reveal[all cards], scores, shuffleSalt)`, `MATCH_END`, `PRESENCE`, `EMOTE`, `CHAT(seatId, text)`, `VOICE(seatId, clipId, mime, durationMs, bytes)`, `CURSOR`.
- A monotonic `seq` lets a client detect gaps and request `RESYNC`.

## 9.3 Animation timing vs. authority
The server applies state changes immediately. Clients play events in an **animation queue** at their own pace; with the speed setting, faster players don't stall others. The server also enforces a **minimum gap** between consequential events (e.g. 400 ms between flips), so every client has time to show each reveal and nobody misses a card.

---

# 10. Rooms, privacy, lobby, reconnect

## 10.1 Access control (private by design)
- **No public room list and no matchmaking.** Nothing is browsable.
- **Room code**: 5 characters from an unambiguous alphabet (no 0/O/1/I/L), e.g. `K7HQ3`, about 28 million combinations. **Technical idle limit:** a room is deleted only after **7 days with nobody connected** (housekeeping, not a game rule). Until then a paused game can always be resumed.
- **Invite link**: `https://heisenberg0066.github.io/marlivo/#/r/K7HQ3`. Opening it on iPhone fills in the code. A share button uses the native share sheet (WhatsApp/Messenger), plus a QR code shown on the laptop for scanning with the phone.
- **Optional join password**: set by the host and stored as a salted hash (SHA-256 via WebCrypto with a per-room salt; PBKDF2 is fine too). Wrong attempts are rate-limited (5 per minute per IP).
- **Friends key, required (RESOLVED Q14)**: a secret passphrase stored as a Worker secret (`FRIENDS_KEY`). **Creating** a room requires it; **joining** needs only the code, plus the room's join password if one is set. This stops strangers who find the Worker URL from using Ammar's free quota. The app remembers the key on his and his friends' devices; Ammar can change it at any time.
- **Owner key** (`OWNER_KEY`, a second Worker secret only Ammar knows) unlocks the Test room (§17.3).
- The host may **lock** the room after everyone has joined (no new joins) and may **kick** a seat.

## 10.2 Identity without accounts
- First launch: pick a nickname and a language. Stored in `localStorage`. The **character is picked in the lobby before each game** (§14.6).
- Each device keeps a random 128-bit **device id**. Joining a room issues a **seat token** (random, stored locally per room; the server stores only its hash).
- Rejoining with the same seat token takes back the same seat. No passwords or emails.

## 10.3 Lobby
- Shows: the room code (big, tap to copy), the share and QR buttons, 4 seat chairs around a mini table (empty chairs show "Waiting…"), each player's avatar, name, flag of their language, Ready toggle and connection dot.
- **Host controls**: the settings panel (§12), move seats (drag), shuffle seats, add bot (§17), kick, lock room, Start.
- Non-hosts see the settings read-only and live. Any change flashes the changed row.
- **Character pick** (RESOLVED Q20): each player picks a character before each game; **duplicates are allowed** (each seat gets its own color ring and name plate, so two identical characters can be told apart).
- **Chat**: the full chat from §10.5 works in the lobby too.
- **Host migration**: the host can hand over from the menu. While the host is disconnected, any connected player can press **"Take over host"** (manual; nothing happens automatically). The host has no extra information; they only manage settings, bots and the optional buttons in §10.4.

## 10.4 Disconnects: pause and wait (v0.6, Ammar's decision; no timer)
- **Detection**: a seat counts as disconnected when its WebSocket closes (app closed, phone locked, network lost), or when heartbeats stop for 10 s (technical detection only).
- **Pause for everyone**: during a round (dice, peek or play), a disconnect **pauses the game for all players**.
  - The seat and its name plate show **"disconnected — waiting"**, and the character plays `away`.
  - A dimmed overlay reads "Paused: waiting for Omar".
  - Every game intent is rejected with "Paused"; chat, emojis and voice notes keep working.
  - **There is no countdown and no timer.**
  - In the lobby or on the round-end screen, nothing pauses; the seat just shows "disconnected".
- **Rejoin whenever he wants**: opening the app or invite link again (the seat token restores the same seat) resumes the game **exactly where it was**, for everyone.
  - His pending roll, peek, draw or decision, his power and his finish choice are all kept.
  - An in-progress **match attempt continues**: flipped cards, the tentative set, the wrong cards already returned and the penalty-due count are all preserved, with no penalty change.
  - The server sends a fresh `SNAPSHOT`, and the client fast-forwards animations with a short "Catching up…" overlay. "Omar is back" shows with a soft chime.
- **Nothing happens automatically.** The game never cancels, plays, skips or decides for a disconnected player.
- **Optional host buttons** (manual, any time while a seat is disconnected):
  - **Replace with bot**: a bot takes over the seat and its cards from that moment. If an attempt was in progress, it is cancelled with no penalty first (flipped cards back face down). The host can hand the seat back when the player returns.
  - **Remove player**: their cards go to the bottom of the deck and they score 0 that round. An in-progress attempt is cancelled with no penalty; a pending power is lost; a pending finish choice counts as "Let X win".
  - **End game**: ends the match for everyone and shows the scoreboard with the current points, marked "Ended by host".
- **The game ends only if**: the host ends it, everyone leaves (presses "Leave game"), or the room reaches the technical idle limit (7 days with nobody connected, §10.1). If everyone is merely disconnected, the paused game is kept and resumes when they come back.
- **Several disconnects**: the game stays paused until every disconnected seat is back, or the host has replaced or removed it.
- **Reconnect mechanics**: the client auto-reconnects with exponential backoff (0.5 s → 8 s) while the app is open; `partysocket` does this out of the box. A closed app reconnects when it is opened again.
- iPhone Safari drops the socket when the app is backgrounded [GK]. A quick look at WhatsApp therefore pauses the table briefly, and play resumes on return, normally within 1–2 s.
- Hibernation-friendly: a paused room has no alarms or timers, so the Durable Object can hibernate at no cost while it waits.

## 10.5 Chat and voice notes (RESOLVED Q15)
- **Kinds of messages**: emojis, preset phrases (EN/FR), **free text** (≤ 300 characters) and **voice notes** (short clips, **≤ 30 s**). All of them work in the lobby and at the table.
- **Where they show**: a speech bubble over the sender's character (a voice note shows a small waveform and plays the character's `talk` idle), and a **chat drawer** with history and an unread badge.
- **Recording UX**:
  - phone: hold the mic button to record, slide away to cancel, release to send;
  - laptop: click to start, click to stop, or hold **V**.
  - A ring shows how much of the 30 s clip length is used; recording stops at 30 s (a clip length cap, not a game timer). An optional preview before sending (setting).
- **Mic permission**:
  - the permission is asked only on the first press of the mic button, after a short explainer ("MarLivo needs the mic to record voice notes; nothing is recorded unless you hold the button");
  - if it is denied, a help card shows how to allow it (iPhone: Settings › Safari › Microphone, or the site's "aA" menu; Android/Windows: the browser's site settings);
  - text chat keeps working without the mic.
- **Format and transport (free)**:
  - Recorded with the browser's MediaRecorder in a compressed format. Opus (WebM/Ogg) where available; AAC (MP4) on iPhone Safari [GK; verify in Phase 3 which formats each browser can play; the sender picks a format every receiver supports].
  - About 24 kbit/s gives ≈ 90 KB for 30 s.
  - Sent as one binary WebSocket message to the room's Durable Object, which **relays it to the other seats and does not store it**. It is never written to SQLite or any file.
  - On the free plan this is one incoming message per clip (well within the DO message limits [S]).
- **Ephemeral**: clients keep clips in memory only, and they are **discarded at match end**. Text messages are also kept only for the current match. No chat is stored on the server after the match.
- **Mute options** (personal settings):
  - mute all voice notes, mute text bubbles, mute a specific player (long-press their name plate);
  - auto-play voice notes on/off (default on, after the first tap unlocks audio on iOS);
  - "Do not disturb while I'm matching" (bubbles hidden during your own attempt).
  - The host can turn **free text** or **voice notes** off for the room.
- **Safety**: text is rendered as plain text (escaped, never HTML); rate limit of 10 messages per 10 s per player and 6 voice notes per minute; there's a size cap per clip. These limits are anti-abuse, not game timers.

---

# 11. Hidden-information security

## 11.1 Threat model (friends, but still)
Friends are trusted not to hack the server, but a curious friend *will* open DevTools on a laptop to look at network messages. The design must make that useless.

## 11.2 Rules
1. **The server is the only holder of the deck order and of face-down card values.** Clients receive **slot ids**, not card ids, for any card they aren't entitled to see.
2. **Per-player projection.** For each event the server builds a separate message per seat. Unit test: for every event, the bytes sent to seat X must not contain any hidden value X isn't entitled to (§21.3 "leak test").
3. **What each player is entitled to see:**
   - their own 2 peeked cards, during PEEK only;
   - the card they drew, during DECIDE;
   - the card they swapped in. After DECIDE the server **does not re-send it**; remembering it is the player's job;
   - the card they peeked with a Queen, for the peek duration only;
   - every face-up card: thrown, swapped-out, flipped in an attempt;
   - at ROUND_END, everything: all remaining cards are revealed to everyone (RESOLVED Q16).
4. **No persistent client cache of secrets.** A Queen peek value lives only in the animation; after the timeout it is wiped from client state. A reconnect `SNAPSHOT` never includes previously peeked values.
5. **No id tracking.** Card ids are random per round, and face-down slots carry no card id. A Jack swap moves **slot contents** on the server only; clients just animate slot A ↔ slot B.
6. **Commit–reveal fairness ("provably fair shuffle")**: at round start the server publishes `sha256(deckOrder ‖ salt)`. At round end it reveals `deckOrder` and `salt`, and the client verifies automatically ("✔ Shuffle verified"). This proves the server didn't rearrange the deck mid-round. It is cheap, and a nice detail for an engineer.
7. **Server-side validation of every intent**: right phase, right player, slot belongs to the player, slot not already flipped this attempt, and so on. Invalid intents get a REJECT with a reason code.
8. **Randomness**: `crypto.getRandomValues` and a Fisher–Yates shuffle on the server; it is never seeded from the client. (Test rooms may use a fixed seed, §17.3.)
9. **Rate limits**: max 20 intents/s per socket, 5 password tries/min, 10 room creations per hour per friends key.
10. **The host is not special**: hosting the room gives no extra visibility.
11. **Transport**: `wss://` only, through Cloudflare's TLS.
12. **Reveal-all, deck forcing and hand editing** exist only in a **Test room** (§17.3). A Test room can only be created with the **owner key** (Ammar), shows a red "TEST ROOM" banner on every screen, never counts scores, and **can never be switched on in a normal friend room**: the server rejects every `TEST_*` intent there (RESOLVED Q22).

## 11.3 Residual risks (accepted)
- Two friends in the same room can tell each other cards over voice or chat (collusion). No technical fix; social rule.
- Screen sharing or a friend looking at your phone. Real-life rule.
- A player taking a screenshot of their own peek. Allowed; it's like writing it down. **No screenshot protection** (RESOLVED Q17). The optional memory helper (§19.3) is the honest version of this.

---

# 12. Settings

## 12.1 Room settings (host, in the lobby; locked once the match starts)
**No timers exist anywhere** (RESOLVED Q5, v0.6): no turn timer, no matching timer, no peek limit, no auto-roll, no auto-continue and no reconnect countdown. A disconnect simply pauses the game (§10.4).

| Setting | Range | Default |
|---|---|---|
| Max players | 2–4 | 4 (the game starts with whoever is seated, ≥2) |
| Bots | Host adds/removes bots (Easy / Normal / Hard) on free seats, plus bot speed | none |
| Cards per player | 4–8 | 6 |
| Target points | 1–21, presets 5 / 7 / 11 | 5 |
| Reveal all at round end | Always (RESOLVED Q16) | On |
| Memory helper | Off / "Training: own known cards" / "Full helper" | **Off** (§19.3) |
| Free-text chat | On/Off | On |
| Voice notes | On/Off | On |
| Join password | optional | none |
| Lock room | On/Off | Off |

Fixed rules, not settings: claim order by server arrival (Q4), others see your power cursor (Q9), starter chosen by dice and then by the last winner (Q3).

## 12.2 Personal settings (each device)
Language (English / Français) · sound on/off + volume per channel (effects / ambience / voice barks) · music on/off · **animation speed** (Cinematic / Normal / Fast) · **reduced motion** (follows the OS setting by default) · haptics on/off (Android/Windows only; iOS Safari has no Vibration API [GK]) · high-contrast cards · large-print cards · color-blind-safe suits (4-color deck) · left-handed layout (on the phone, action buttons on the left) · confirm before swap (two taps) · slot numbers on/off · camera mode (§14: "Seat view" tilted first person, **the default on every device** (RESOLVED Q23), or "Top-down" flat) · chat: mute voice notes / mute text bubbles / mute a player / auto-play voice notes / preview before sending.

---

# 13. Screens

Every screen has a small top bar: the room code, a connection dot, a settings gear and the language switch.

## 13.1 Home
- Title **MarLivo** in warm, hand-painted lettering on a small wooden sign, over a softly blurred view of the cosy back room (lantern glow, steaming tea glasses).
- Buttons: **Create room** (needs the friends key the first time), **Join room** (code field + paste + scan QR), **Practice vs bots** (§17.1), **How to play** (an interactive tutorial: a scripted round against 1 bot that explains matching, wrong cards and powers), **Settings**, **Test room** (shown only on devices where the owner key was entered, §17.3).
- "Continue game": shown when a seat token exists for a still-active room.

## 13.2 Create / join
- Create: name, character, then the room is created, with the code shown big and the share/QR buttons.
- Join: code (auto-uppercase, auto-advance), then password if needed, then name/character, then lobby.
- Errors: "Room not found", "Room full", "Room locked", "Wrong password (4 tries left)".

## 13.3 Lobby
As in §10.3. The mini table in the center shows chairs with the character models or busts sitting down as players join (a "sit down" animation). **Character picker** before each game: a carousel of all characters (at first the 3 placeholders of §14.6, later Ammar's). Duplicates allowed; each player gets a seat color ring.

**Start dice roll (round 1 of each match, RESOLVED Q3).** After Start, a wooden die sits on the felt in front of each player. Tap **Roll!**, flick the die (phone) or click it (laptop); there is no auto-roll; the table waits (the host can nudge with an emoji). Bots roll themselves. The dice tumble and bounce (the animation is precomputed to land on the server's value), and all results show together. The highest die glows gold and hops, "Sara starts!" appears, and the spotlight moves to her. On a tie, the tied dice shake, "Tie! Roll again" shows, and only the tied players roll. Later rounds show a short banner instead: "Last round's winner Omar starts".

## 13.4 Table (main game screen)
- **Center**: the deck (a stack with a visible thickness that shrinks as cards are drawn; a count on hover/long-press) and the discard pile (the top card plus a slight fan of the last 3). Above the pile, the **target badge** "Match 9" while a window is open.
- **Own area**: front of the screen, bigger cards, slot numbers.
- **Opponents**: their areas across and to the sides, with the character behind each area, a name plate (name, score, card count, connection dot), a turn indicator (a warm spotlight on the current player) and the Match queue position if any.
- **Bottom action bar** (context-sensitive): Draw / Throw / Swap / Match N / Remove / Give up / Skip / Confirm.
- **Top status line**: "Your turn: draw a card", "Sara is matching (target 9)…", "Waiting for Omar to draw".
- **Side drawer**: the event log (a public history with icons, e.g. "Omar threw 9 · Sara matched 9 · You matched 5+4 · Ali: wrong 8, +2").
- **Chat** (§10.5): an emote wheel (8 emojis + 8 preset phrases), a text field and a mic button for voice notes; bubbles appear over the sender's character, and the chat drawer keeps the history for this match.

## 13.5 Peek phase
- Banner: "Pick any 2 of your cards to peek" (RESOLVED Q18: each player chooses). Your cards gently bob. Tap one and it **lifts and tilts toward you** with the face visible (others see it lift with its back to them). Tap a second one. Both stay visible until you press "Memorized ✓" (no time limit).
- When everyone has pressed Memorized, the cards drop face down with a soft thud (no countdown).
- Others' status shown as "Ali peeking… ✓ Ready".
- Bots pick 2 cards at random.

## 13.6 Draw / decide (your turn)
- Draw: tap the deck or drag the top card toward you. The card slides to a "hand" position in front of you (bottom-center, large) and flips **only on your screen**. Others see it rise to your hand with its back to them.
- Two big choices:
  - **Throw**: tap the pile or drag the card onto it.
  - **Swap**: tap one of your face-down cards or drag onto it. With "confirm before swap" on, the target slot glows, and a second tap confirms.
- The swap animation: your hand slides the drawn card under the chosen card, pushes the old card out, and the old card flips mid-air as it flies to the pile (§16).
- A quiet reminder chip shows the drawn card's power, e.g. "Q: you'll peek if you throw it".

## 13.7 Match flow
1. The window opens: a target badge appears and the Match button pulses for everyone.
2. Claim: you are either granted or queued (#2…), in server arrival order. You can cancel for free before your first flip (Q26).
3. Granted: banner "Match 9: flip cards one at a time". Your cards get a white outline. A **sum meter** for the tentative set ("0 / 9") and a **penalty-due counter** ("Penalty due: +0") appear. Buttons: **Give up**, and **Cancel** (free, only before the first flip).
4. Each flip turns the card face up in place, then it becomes:
   - **tentative**: it slides into the tentative row in front of your area, and the meter fills;
   - **wrong, doesn't fit (overshoots)**: a soft red glow and a cartoon "bonk"; the card wiggles, flips face down and slides back into its slot (a small red ✕ fades on it); penalty due +2. The meter flashes at the overshoot and settles back;
   - **complete**: the exact set flies to the pile one by one, with a chime chord and a "+MATCH" burst.
5. **Remove from the set**: tap a tentative card. It lifts and shows a small "Remove (+2)" button; confirm, and it flips back to its slot, penalty due +2. Hint line: "Doesn't fit? Remove it, then flip another."
6. **Give up**: a confirm dialog that counts only cards actually flipped, e.g. "Give up? The 1 flipped card counts as wrong (+2 cards)" or "All 3 flipped cards count as wrong (+6 cards)". On confirm, the tentative cards go back.
7. **Out of cards**: if you have no unflipped cards left and the sum isn't exact, "No cards left: attempt failed", and it ends like a give-up.
8. **End of attempt**: a summary chip ("Matched 7+3+2 · 3 wrong · +6"), then all penalty cards fly in as one sequence (§16.8).
9. Then any earned power starts (§6). You may claim again on the same throw (Q7).
10. **Finish chance (turn player only, §5.3)**: when someone else empties their area on your throw, a card-table banner appears: "Omar has emptied his area. You may try to finish first." Two buttons: **Try to finish** and **Let Omar win**. No timer. Everyone else sees "Sara is deciding…".
11. **Disconnect**: if you drop mid-attempt, the game pauses for everyone and waits for you. When you rejoin, you carry on exactly where you were (tentative set and flipped cards kept). Only if the host replaces or removes you is the attempt cancelled, with no penalty (§10.4).

## 13.8 Power flows
As in §6. Common UI: a power banner in the card's color (Jack gold, Queen blue, Ten red), a **Skip** button where allowed, and a hint line.

## 13.9 Penalty
- When the attempt ends, a "+N" counter pops above the player's area. The cards fly from the deck one after another, spinning once, and land with a soft "plop" in the gaps first, then in new positions (§7.2).
- The receiver's character plays a comic reaction (a groan, head in hands); friends' characters laugh or tease.

## 13.10 Round end
- Freeze, slow-motion on the winner's final match. Every remaining card on the table flips face up for everyone in a wave (always; RESOLVED Q16). The winner's spotlight brightens.
- Banner: "Omar won the round, and starts the next one".
- A scoreboard panel slides in: round winner +1 (a coin flies to their tally), current scores against the target, and "Next round" ready buttons.
- The fair-shuffle check: "✔ Deck verified".

## 13.11 Scoreboard / match end
- Match winner: a trophy animation, the character's victory animation, confetti, a short fanfare.
- Stats per player: rounds won, successful matches, longest combination, penalty cards taken, Jack swaps used, "best memory" (fewest wrong flips).
- The fun "Hall of Shame": "most penalties in one attempt".
- Buttons: Rematch (same seats and settings), Back to lobby, Home.
- Match history: the last 20 matches saved locally on each device (no server storage needed); optionally also kept in the DO for 30 days.

---

# 14. Reference: Liar's Bar style

Ammar named **Liar's Bar** (Steam, by Curve Animation, released 2 Oct 2024 in Early Access) as the reference for **camera and animation feel**: the seated first-person view, the visible hands, how cards are handled, and characters' idles, glances and reactions. **The mood is not copied (RESOLVED Q19):** ours is a warm, cosy, friendly back room with tea and cards, not dark tension (§14.3). Everything is **our own original art**. **No assets, characters, names, logos, music or UI graphics from Liar's Bar will be copied.** It is a camera and animation reference only.

## 14.1 What I could verify
Sources: the Steam store page [F: store.steampowered.com/app/3097560], the 8 official Steam screenshots, which I viewed [V], Wikipedia [S] and reviews (The Game of Nerds, Forbes, GameArtSpace) [S].

| Aspect | Observation | Source |
|---|---|---|
| Premise / camera | A table of 4 in a "sketchy bar", described as a "first-person multiplayer online experience" | [F] |
| Camera | First person from your chair. **Your own hands are visible in the foreground**, holding cards up close and fanned (one shot shows two big cards held near the camera), or holding objects. Opponents sit across and to the sides | [V] |
| Look around | "Smooth camera movement… allowing you to look around and see other players" | [S Game of Nerds] |
| Table | A **round wooden table** with a worn, stained **dark-red/maroon top**, a raised wooden rim, props scattered on it (bottles, glasses, a chalk circle drawn on the surface in one shot) | [V] |
| Lighting | **Low and warm.** An amber/orange key light pools over the table centre; the surroundings fall off into dark browns and blacks. Neon signs glow in the background. "The lighting stays low and focused entirely on the center of the table" | [V] + [S GameArtSpace] |
| Environment | A cluttered, run-down bar: wooden walls and shelves, bottles, booths, background patrons; "the bartender is serving drinks, a monkey is playing the guitar" | [V] + [S Game of Nerds] |
| Characters | Stylized **anthropomorphic animals** (pig, bull/buffalo, dog, fox and more) in rough clothes: tank tops, tattoos, jewelry. Semi-realistic 3D with exaggerated, expressive faces. They look "worn-out and rough around the edges" | [V] + [S Wikipedia, GameArtSpace] |
| Character animation | Praised as the highlight: "throwing the cards, shaking the dice cups, punching the table and shouting 'Liar'"; nervous sweating and smug card slams | [S Game of Nerds, GameArtSpace] |
| Voice | Random character one-liners ("barks") on events, e.g. on playing 3 cards. The store page discloses AI-generated voices | [S] + [F] |
| UI | Minimal and diegetic-leaning: **floating name labels** above each character with a small icon and a counter like "(0/6)"; a **round/turn number in a circle at top centre**; a **top-right panel** "Your Turn" listing the available actions; a **top-left table title** (e.g. "ACE'S TABLE") with the table card; **small key-hint prompts in the bottom corners** ("Look"); a centered **semi-transparent results panel** at showdown. Thin white/cream sans-serif text with gold accents | [V] |
| Drama FX | Moments of loss use a heavy **radial blur / red vignette** full-screen effect | [V] |
| Engine | Unity | [S Wikipedia] |
| Tone | "Sleazy and rough", darkly comic, physical comedy | [S Forbes] |

## 14.2 What I inferred (not verified, from stills and reviews only)
- Cards are thin, slightly matte/worn, small relative to the hands. Throws appear to be quick wrist tosses that slide on the felt.
- A subtle **shallow depth of field** (background bar slightly soft), a warm color grade, light film grain and vignetting.
- Idle loops: characters breathe, shift weight, glance at whoever is acting; the first-person camera sways slightly.
- Character heads turn toward the active player ("look-at" behavior).

Exact timing and easing curves can only be confirmed by watching gameplay video. Ammar should do this (he knows the game) and comment on §16.

## 14.3 Our own art direction: the friendly back room (RESOLVED Q19)
- **Mood**: warm, cosy, welcoming, like friends after dinner. Laughing, not threatening.
  - **Taken from Liar's Bar:** the seated first-person camera, visible hands, physical card handling, and characters who react and look at each other.
  - **Left behind:** grime, danger, dark tension, guns, poison, death effects, red vignettes and blur.
- **Setting**: the small back room of a family café, or a friend's majlis-style room.
  - A low brass lantern with a warm glow, a patterned rug, wooden chairs with cushions, a shelf with tea glasses and a teapot/dallah, a window with soft evening light.
  - Small ambient life instead of bar patrons, e.g. a cat asleep on a cushion.
  - A wooden table with soft green or warm terracotta felt; a tea glass and a small bowl of nuts or dates by each seat; chalk tallies on a little slate per seat (the diegetic score).
- **Lighting**: warm, soft and always readable. A golden key light from the lantern over the table, plus a gentle fill so the corners are cosy rather than black. Light steam rises from the tea glasses; the lantern sways a little when someone slams a card.
- **Drama, friendly style**:
  - Penalties are comic: cards plop down with a cartoon "boing", and friends' characters laugh or tease.
  - The Jack is "sleight of hand"; the Queen is a "shielded peek".
  - Big moments get warm sparkles and confetti, never red flashes or blur.
- **Camera**: a seated first-person view tilted ~35–45° down at the table, with your own face-down cards in the foreground; each opponent's cards lie in front of them, with their character behind.
- **UI style**: the reference's *structure* (name plates over characters, a top-centre round badge, a top-right action panel, corner hints, a centred results panel) in our own warm look: cream paper panels with rounded corners, wood and brass accents, soft shadows.
- **Palette (proposal)**: background warm walnut #3B2A1E to #5A3E2B; felt soft green #2F5D4A or terracotta #A4533A (a setting); lantern light #FFC877; brass #C9A15B; cream panels and text #F6EBD9; ink #2B1D14; Jack gold #E2B23C, Queen blue #5DA9E9, Ten coral #E9765B, success #7BD389.
- **Typography**: free fonts. **Fredoka** or **Baloo 2** (friendly, rounded) for titles, **Inter** for UI (all SIL OFL, all with the French accented characters) [GK].

## 14.4 Two visual stages
**Stage A, "2D with depth" (build now).** A real-time 3D scene with simple geometry, so we never rewrite later:
- **Three.js** via **react-three-fiber** (MIT, free). The table is a 3D mesh, cards are thin 3D boxes with front/back textures, and the camera is a perspective camera at the seat. Cards get true flips, arcs and soft shadows from the lamp.
- **Characters in Stage A**: illustrated **2D busts/cut-outs** (billboards) behind each seat, with a few layered parts (head, torso, arms) animated by simple tweens (breathing, head turns, a "slam" pose swap) and 4–6 expression variants (neutral, smug, shocked, angry, laughing, sleeping/away). Until Ammar's art is ready: original placeholder silhouettes in brass outline, colored per seat.
- **First-person hands in Stage A**: stylized 2D hand sprites (original) for draw, hold, throw and peek.
- **Post-processing (cheap)**: a very light vignette, a warm grade, soft bloom on the lantern. A **"Low graphics"** toggle disables it for older phones.
- **Fallback camera "Top-down"**: the same scene viewed from above. Clearest for memory, best on very small screens.

**Stage B, full 3D (later).** Same scene and camera, with the billboards replaced by Ammar's rigged characters (GLB). Look-at, idle, reactions and first-person arms all animated. Requirements in §14.5.

## 14.5 3D character asset requirements (Ammar supplies)
**Format**
- Preferred: **glTF 2.0 binary (.glb)**, one file per character with all animation clips embedded (or one mesh .glb + one animations .glb per character).
- Accepted: **FBX** (7.4+). We convert to GLB with Blender (free) in our pipeline.
- Source files (.blend / .fbx with textures) are welcome for later fixes.

**Technical budget (iPhone-friendly)**
- **≤ 25k triangles per character** (≤ 15k preferred for 4 on screen on a phone). ≤ 60 bones for the body plus finger bones.
- Textures: PBR metallic-roughness, **1024×1024** (2048 max) per map: base color, normal, ORM. They will be compressed to KTX2/Basis, meshes with Draco/Meshopt, via `gltf-transform` (free) [GK].
- Scale in **meters**, **Y-up**, character facing **+Z**, origin at the hips projected to the seat (so it can be placed on a chair). Apply all transforms.
- **Humanoid rig** with standard naming, ideally **Mixamo-compatible** (`mixamorig:Hips`, `Spine`, `Neck`, `Head`, `LeftHand`…), so free Mixamo animations can be retargeted [GK: Mixamo is free with an Adobe account; check its licence terms]. **Full finger bones** are required (holding and flipping cards).
- Optional **facial blendshapes / morph targets**: `blink_L`, `blink_R`, `mouth_open`, `smile`, `frown`, `surprised`, `angry`. Without them, the face uses jaw/eye bones or simply stays still.
- **First-person arms**: a separate lightweight rig (arms + hands only, ≤ 8k tris) per character or one shared, for the local player's view.
- A seated **base pose** where hands rest on the table edge (an IK target at the table height we define: table top 0.75 m, seat 0.45 m).

**Required animation clips** (seated unless noted; names exactly as listed so code can find them; 30 fps; loops marked ⟳)

| Clip | Purpose | Length |
|---|---|---|
| `sit_idle` ⟳ (+ `sit_idle_2`, `sit_idle_3` variants) | Breathing, small weight shifts | 4–8 s |
| `sit_down` / `stand_up` | Joining and leaving the lobby | 1–2 s |
| `look_left` / `look_right` / `look_center` (additive) **or** head/neck bones free for procedural look-at | Look at the active player | n/a |
| `think` ⟳ | Chin rub / tapping lips while deciding | 3 s |
| `wait_impatient` ⟳ | Finger drumming | 3 s |
| `reach_draw` | Reach to the deck, take a card | 0.8 s |
| `inspect_card` | Look privately at the drawn card, shield it | 1 s |
| `throw_card` | Wrist toss onto the pile | 0.6 s |
| `swap_card` | Slide a card into own area, push the old one out | 0.9 s |
| `flip_card` | Flip own card face up (match attempt) | 0.5 s |
| `match_slam` | Confident slam of the final matching card | 0.7 s |
| `peek_card` | Lift a card's corner and peek (Queen) | 1.2 s |
| `reach_across` | Long reach to an opponent's area (Jack swap) | 1.2 s |
| `push_card` | Push a card toward an opponent (10 power) | 0.8 s |
| `react_wrong` | Wince or head shake on a wrong flip | 1 s |
| `react_penalty` | Head in hands / slap table on receiving penalties | 1.5 s |
| `react_surprised` | Something unexpected (Jack swap on me) | 1 s |
| `laugh`, `point`, `shrug`, `facepalm` | Emotes | 1–2 s |
| `round_win` | Small fist pump | 1.5 s |
| `match_win` | Big celebration (can stand up) | 3–4 s |
| `match_lose` ⟳ | Slumped, sulking | 3 s |
| `away` ⟳ | Asleep, head on the table (disconnected) | 4 s |

First-person arm clips: `fp_idle`, `fp_draw`, `fp_hold`, `fp_throw`, `fp_swap`, `fp_flip`, `fp_peek`, `fp_reach_across`, `fp_push`, `fp_slam`.

Optional **voice barks** (Ammar's friends could record them; free, personal): 3–5 per event (draw, wrong, penalty, match, jack swap on you, win), in English or French. Format: mono OGG/MP3, ≤ 3 s, −16 LUFS.

**RESOLVED Q20:** Ammar will supply several characters later. Each player picks one before each game; duplicates are allowed. Until then, the placeholders in §14.6 are used.

## 14.6 Placeholder characters for testing (original, ours)
Three simple, original characters, drawn by us for Phase 1–2 testing and released with the project. Each comes as a 2D bust with 5 expressions (Stage A). A low-poly rigged GLB version of one of them will be made in Blender to test the Stage B pipeline before Ammar's models arrive.

| Name | Look | Personality cue |
|---|---|---|
| **Biscuit** | A round brown bear in a knitted mustard cardigan, holding a tea glass | Warm, laughs at everything |
| **Mint** | A slim grey cat with round glasses and a green scarf | Calm, smug when matching |
| **Pepper** | A small orange owl with a red beanie | Excitable, flaps on penalties |

They are drawn in the friendly back-room style (§14.3) and are replaced or joined by Ammar's characters later, with no code change.

---

# 15. Languages and accessibility

## 15.1 Languages (v0.3: English + French)
- **English and French** only. Each player picks their own language, and a mixed table works because events are sent as codes, not text. There is **no RTL** requirement; the layout is left-to-right only.
- **Card names are English only, in both languages** (RESOLVED Q21): A, 2–10, J, Q, K on the card faces, and "Ace / Jack / Queen / King" (or J/Q/K/A) in the log and toasts, in French too (e.g. "Sara a joué un J"). There is no localized or Arabic-letter card option.
- All strings live in `i18n/{en,fr}.json` (i18next, with French plural rules). Ammar can edit the text himself.
- French details handled by the layout:
  - French text runs ~15–25% longer [GK], so buttons and banners must allow it;
  - a narrow no-break space before `! ? : ;` (e.g. "Bien joué !");
  - guillemets « » in quotes.
- Proposed French wording for key UI (Ammar to review):
  - Draw = **Piocher**, Throw = **Défausser**, Swap = **Échanger**, Match = **Assortir**, Give up = **Abandonner**, Remove = **Retirer**, Skip = **Passer**;
  - Your turn = **À toi de jouer**, Round = **Manche**, Penalty = **Pénalité**, Room code = **Code du salon**.

## 15.2 Accessibility
- Every action works by **tap, drag and keyboard**. Laptop shortcuts: D draw, T throw, 1–9 choose own slot, M match, R remove the selected tentative card, G give up, Esc cancel, Tab/arrows to move between slots, Enter confirm, ? help.
- Screen-reader labels (ARIA) on all controls. A live region announces public events ("Sara threw 9. Match window open").
- Minimum touch target 44×44 pt. Text ≥ 16 px. Contrast ≥ 4.5:1 on the dark theme.
- **Reduced motion**: replaces flights and flips with fades and short slides, removes camera sway and shake, and disables lantern flicker and sparkle effects (also important for photosensitivity).
- A **color-blind-safe 4-color deck** option, and power colors always paired with icons (J ⇄, Q 👁, 10 +1).
- Sounds are never the only cue; every sound has a visual counterpart.
- "Large cards" mode for phones.

---

# 16. Animations and sounds

Animation speed presets scale all durations: **Cinematic ×1.3**, **Normal ×1.0**, **Fast ×0.6**; reduced motion is described in §15.2. Defaults below are for Normal. Easing names follow standard CSS/GSAP curves. Library: **GSAP** for tweens on 3D objects (free for all uses since 2025 [GK, verify licence]), or the `motion` library; the springs come from `@react-spring/three`.

## 16.1 Table and ambience
| Moment | Animation | Sound |
|---|---|---|
| App opens | The lantern glows up warmly; the camera eases from the doorway to the seat (1.2 s, skippable) | A door creak, a kettle's hum, soft room tone fades in |
| Ambient | The lantern sways slightly; steam rises from the tea glasses; characters breathe, sip tea, glance at each other; the cat stretches now and then (OFF with reduced motion) | Optional loop: soft oud / acoustic café track (original or CC0), tea glasses clinking, quiet laughter from the next room. Music volume separate |
| Start dice roll (round 1) | Dice tumble across the felt with 3–4 bounces and settle (1.2 s; precomputed to land on the server's value); all revealed together; the winner's die glows gold and hops; on a tie the tied dice shake and roll again | Wooden dice rattle and clacks; a small cheer for the winner |
| Player disconnected (pause) | The table dims slightly; a "disconnected — waiting" tag with a slow pulsing dot (no countdown) appears on their name plate; their character plays `away`. On return the tag bursts into sparkles and the table brightens | A soft "pause" tone; a chime on return |
| Chat bubble / voice note | Bubble pops over the sender's character; a voice note shows a waveform while playing, and the character does a small `talk` idle | Soft "pop" for text; voice plays at the voice channel volume |
| Turn change | Warm spotlight glides to the new current player (0.5 s); their name plate glows; your own turn adds a soft chime and a gentle camera nudge | Soft "tick" chime |

## 16.2 Dealing
- The deck slides to centre from the "dealer" side, with a riffle-shuffle animation (two halves interleave, 0.9 s).
- Cards fly one by one in seat order, each on a low arc that spins ~180° in yaw and lands with a slight slide on the felt and a micro-bounce. 120 ms between cards, 450 ms per flight, `power2.out`.
- Each landing: a soft "thup". Shuffle: a riffle sound.

## 16.3 Peek
- The chosen card lifts 3 cm, tilts 60° toward the viewer (only on your screen; others see it lift with the back facing them), holds, then lays flat (350 ms down).
- Sound: a soft paper slide. On "Memorized": a small click.

## 16.4 Draw
- The top card lifts off the deck, flies to the "hand" zone (400 ms) and flips 180° (250 ms) on your screen only. Other screens: the card goes to that player's hand position with its back visible, held by their character or hand sprite.
- The deck height shrinks by one card's thickness.
- Sound: a crisp card slide.

## 16.5 Throw
- A wrist toss: an arc from the hand to the pile with a little spin. It lands with a slide and settles at a random rotation (±12°) so the pile looks natural. 450 ms.
- Sound: a card slap (3 random variations to avoid repetition). A J/Q/10 also gets a short stinger (Jack: coin-flick whoosh; Queen: a soft "shh" chime; Ten: a low drum hit).

## 16.6 Blind swap
1. The drawn card hovers above the chosen slot (200 ms).
2. It slides **under** the old card, pushing it out toward the centre (300 ms). The new card stays face down.
3. The old card rises and **flips face up mid-flight** on everyone's screen, then lands on the pile (450 ms).
- Others see a "blind" eye-slash icon above the slot for 1 s, to say this player knows the new card there.
- Sound: slide, then a flip snap, then a slap.

## 16.7 Match attempt
- Claim: a soft bell; the claimer's spotlight brightens; others' Match buttons show "queued".
- Flip: the card rotates 180° on its long edge (300 ms) with a slight lift; a paper "flick".
- Tentative: the card glides into the tentative row (250 ms); the sum meter fills with a counter tick per point (a little mechanical odometer).
- **Doesn't fit (overshoots, returns as wrong)**: a soft red rim glow and a cartoon "bonk"; the card wiggles ±5° twice, flips face down and slides home (400 ms); the penalty-due counter bumps +2 with a little bounce. The character plays `react_wrong`. Camera shake stays off in the friendly theme.
- **Removed from the set**: the card lifts, flips face down and slides home (350 ms); penalty due +2.
- **Complete**: the exact set flies to the pile in sequence (120 ms apart), with a warm "MATCH!" burst, a brass "ding-ding" chord and gold sparkles. The character plays `match_slam` on the last card.
- **Give up / out of cards**: tentative cards flip back and slide home one by one, then the penalty sequence.

## 16.8 Penalty cards flying in (at the end of the attempt)
- A "+N" badge pops above the area (scale 0→1.2→1, 300 ms).
- Cards fly from the deck **one at a time** (180 ms apart) on a playful, bouncy arc with a full spin, and land with a soft "plop" and a small puff: gaps first, then new positions (§7.2), where a new slot outline fades in first.
- The receiver's character plays `react_penalty` (a comic groan); others may laugh or tease (a random 30% chance of a laugh bark).
- Sound: a whoosh and a plop per card. With 6+ cards the sequence speeds up, plus a "sad trombone" sting (toggleable as "comedy sounds").

## 16.9 Jack swap between players
- The power owner's hand/cursor reaches out. Card A lifts and glows gold, then card B.
- Confirm: both cards rise 6 cm, travel on **crossing arcs** (one higher than the other so they don't collide) with a gold motion trail, and land in each other's slots (700 ms). The camera does a gentle pan to keep both in view on phones.
- Affected players' characters glance at their cards (`react_surprised` if their card moved).
- Sound: two whooshes crossing (left to right stereo pan), then a sly "shing".

## 16.10 Queen peek
- The owner's view: the card tilts toward the camera behind a "cupped hand" sprite or FP hand; a blue glow; the value is visible for the peek duration; it then lays back down.
- Others: the card lifts at an angle with its back toward them; a blue eye icon. Sound: a gentle chime and a paper lift.

## 16.11 Ten: give a card
- The owner picks a target; the deck's top card **slides across the felt** (not flown: "pushed") to the opponent's area, spinning slightly, and stops in the new slot (600 ms). A "+1" badge. Sound: a long felt slide, then a tap.

## 16.12 Reshuffle
- The pile (minus the top card) gathers into a squared stack, flips face down, riffles, and becomes the deck (1.2 s). A "Reshuffled" chip. Sound: a gather swish, a riffle, a tap-tap.

## 16.13 Round and match end
- Final match: slow motion ×0.5 on the last card, light flare, the music ducks.
- Reveal wave: every face-down card flips in a ripple from the winner outward (40 ms apart).
- A chalk mark is drawn on the winner's slate (a diegetic score); a coin/token flies to the score panel.
- Match win: fanfare, confetti in brass and cream, the character's `match_win`, the others `match_lose`.
- Sounds: "round won" sting, chalk scratch, applause and cheers from the room.

## 16.14 Sound sources (free)
- **Kenney.nl** casino/card audio packs (CC0) for card slides, slaps and chips [GK]. Freesound.org CC0 for ambience [GK]. Original music made in a free tool, or CC0 tracks. Every file is listed in `CREDITS.md` with its licence.
- Audio engine: **Howler.js** (MIT) or plain WebAudio. iOS unlocks audio only after the first user tap; the "Tap to enter the room" overlay handles that [GK].
- Mixing channels: effects, ambience, music, voice barks.

## 16.15 Haptics
- Android/Windows (if supported): short pulses on your turn, a wrong card and receiving penalties. iPhone Safari has no web vibration [GK], so visual and audio cues only. The optional Windows desktop build could use controller rumble; skip.

---

# 17. Solo / test mode (Phase 1 deliverable)

Lets Ammar play and test alone before sharing with friends. Access levels (RESOLVED Q22):

| Level | Who | What |
|---|---|---|
| Everyone | any player | Practice vs bots offline (§17.1); bots in rooms |
| Room host | the host of any normal room | Add/remove bots, bot speed, "Open test seat" windows (§17.2), and per-window tools that reveal nothing hidden: own event inspector, network simulation for own window |
| Owner | Ammar only (owner key) | The **Test room** (§17.3): reveal-all, deck forcing, hand editor, step mode, seeded replay, bot autoplay |

Giving reveal-all and deck forcing to every host was judged too risky (a host could run a "normal-looking" game with hidden advantages), so they are owner-only and Test-room-only. Build flags `FEATURE_SOLO` and `FEATURE_TESTROOM` can still remove features later (§17.4).

## 17.1 Practice vs computer bots
- From Home: **Practice vs bots**. Choose 1–3 bots, cards per player, target points and **bot speed**.
- **Runs fully offline in the browser**: the same engine runs in a Web Worker acting as the local server, with the same per-player projection. Bots run in the "server" role and **receive only their own player's view**, so they can't cheat. The UI code path is identical to online play.
- **Bots are available to everyone** (RESOLVED Q22). They can also be **added to any online room** by its host ("Add bot" in the lobby), e.g. to make a 3-player game with 2 humans. There they run inside the Durable Object, again using only their seat's projected view.
- Bot names: original, e.g. "Lina", "Max", "Chloé"; they use the placeholder characters (§14.6).

**Difficulty levels (rule-based, no AI service):**

| Level | Memory | Matching behavior | Powers |
|---|---|---|---|
| **Easy** | Remembers each known card with a probability that decays (e.g. 85% after 1 turn, 50% after 5 turns). Sometimes "misremembers" a value by ±1 | Tries matches only with cards it "believes" match. A plausible confidence threshold (55%), so it makes realistic mistakes and sometimes gives up too late | Jack: random swap 50% of the time, otherwise skips. Queen: peeks at its own unknown card. Ten: random opponent |
| **Normal** | Remembers known cards (~95%), slower decay, tracks Jack swaps | Single matches when sure; combinations of 2 when sure of both; stops after the first wrong card | Jack: swaps its known high card with an opponent's unknown card, or disrupts the leader's known cards. Queen: peeks at the leader's unknown card or its own unknown. Ten: gives to the player with the fewest cards |
| **Hard** | Perfect memory of everything it legitimately saw, including wrong flips by others and tracking through swaps | Finds the best combination with a tiny search over its known cards; claims fast; considers ending the round | Jack: targets the opponent closest to winning; Queen: maximizes information; Ten: goes to the leader |

- Bot timing (setting **bot speed**: Slow 2–4 s / Normal 1–2 s / Fast 0.3–0.6 s / Instant for testing), with random human-like jitter. Bots claim in normal server arrival order after their human-like delay, so at Slow/Normal speed they don't snipe every match; Fast/Instant are meant for testing.
- Bots "act" visually: thinking animation, a hand hover over a card before choosing, and emotes (laugh at your penalty, shrug at their own).
- Bot decision logic is a small plain-TypeScript module with unit tests and **no paid AI**.

## 17.2 Local two-window test mode ("hot-seat over the real network")
- Ammar opens **two (or up to four) browser windows/tabs** on one laptop (e.g. a normal and a private window, or two browser profiles, so each has its own seat token) and joins the same room. Each window is a separate player going through the **real Cloudflare server path**. This tests networking, projection and reconnect exactly as friends will experience it.
- Helper: in the lobby, an "**Open test seat**" button (available to the host of any room; it reveals nothing) opens a new window with `?seat=new&tag=P2`, using an isolated session-storage token so tabs don't collide. Each window gets a colored frame border and big title "TEST P2" so they can't be confused.
- A **single-window hot-seat** variant: one window, with a "Pass to P2" curtain between turns (hides the screen until tapped) for quick couch testing on one device. This is not secure against peeking, so it's only for testing.
- Also works between iPhone and laptop: create on the laptop and join from the phone with the QR code.

## 17.3 Test room (owner only)
Created only with the **owner key** (Ammar), from Home › Test room. **Every screen shows a red "TEST ROOM" banner; scores and stats are never saved.** Friends Ammar invites can see that it's a Test room. A normal friend room can never become a Test room, and the server rejects every `TEST_*` intent outside one (RESOLVED Q22).
- **Reveal all cards** toggle (faces shown at 50% opacity with values), per window.
- **Step mode**: the server pauses after each event; "Next event" advances it (good for checking animations and the order of powers and claims).
- **Force deck order**: paste a list like `9H, 5S, 4D, QC, JD, 10S, …`, or pick from presets:
  - "Jack chain": tests a Jack matched by a Jack (two queued powers).
  - "Six flips, three wrong": Ammar's R18 example (target 12, 3 cards played, 6 flipped → +6).
  - "Combo with mistake": 7, 3, 5 (overshoots), 2 → +2.
  - "Give-up 6 penalties": the 7, 3, 4 example of R19.
  - "Give-up 1 card": target 9, trying 4+5, flip the 5, give up → +2.
  - "Remove from set": 7, 2, 9 (overshoots), remove the 2, 5 → +4.
  - "Out of cards": target 9 with only 5, 2, 1 → +6.
  - "Double match": one player matches a 9 and then 5+4 on the same throw.
  - "Dice tie": forced rolls 6, 6, 3 → seats 1 and 2 re-roll.
  - "Placement": penalties fill gaps, then go to random row ends.
  - "King via J+2": R22.
  - "10 with 2 players / 3 players".
  - "Last card win out of turn": R25.
  - "Turn-player finish rule": another player empties first, the turn player tries and wins, or fails.
  - "Empty deck reshuffle" (keeps the target and open-match cards), "No cards anywhere" (no-winner end).
- **Set a hand directly**: an editor to set any slot's card, the deck count and the pile.
- **Seeded RNG**: replay a recorded game from its seed and action log.
- **Event inspector**: a live list of the raw events received by this window, highlighting private fields. This is also a manual check that nothing secret leaks to other seats.
- **Network simulation**: add latency (0–1000 ms) and drop the connection on demand to test pause-and-resume (including resuming an in-progress attempt) and the host's Replace/Remove/End buttons.
- **Bot autoplay**: let bots play all seats at Instant speed for 100 games and show stats (soak test).

## 17.4 Turning it off later
- Practice vs bots stays for everyone (RESOLVED Q22). It can be compiled out with `FEATURE_SOLO=false`.
- The Test room UI ships in the app but does nothing without the owner key; the server alone decides. `FEATURE_TESTROOM=false` (client) and `ALLOW_TEST_ROOMS=0` (server) remove it completely.
- The owner key can be rotated by changing the Worker secret.

---

# 18. Layouts

## 18.1 iPhone portrait (primary for friends; design target 390×844 pt and 375×667 for older phones)
```
┌──────────────────────────────┐
│ K7HQ3 ●   Round 2 · 3/5   ⚙  │ top bar: code, round, target, settings
│        [Opp across]          │ character bust + nameplate + mini card grid
│ [Opp L]   ┌─────┐   [Opp R]  │ side opponents shown smaller, angled
│  ▯▯▯      │DECK │PILE  ▯▯▯   │ deck + pile + "Match 9" badge
│  ▯▯▯      └─────┘      ▯▯▯   │
│ ───────── tentative row ──── │ (only during your attempt)
│     ┌──┐┌──┐┌──┐             │
│     │1 ││2 ││3 │  own area    │ larger cards, slot numbers
│     │4 ││5 ││6 │              │
│ [ Match 9 ]   [ Draw ]       │ action bar (thumb zone)
└──────────────────────────────┘
```
- Opponent cards are about 60% of own card size; long-press any opponent area to **zoom** it (a peek at the layout, not the values).
- With more than 9 own cards, the own area becomes a horizontally scrollable 3-row grid with edge fades; slot numbers keep it navigable.
- Safe-area insets (notch, home bar) respected. Landscape on phones is supported, using the laptop layout scaled.
- In camera mode "Seat view" the table is tilted (first person); in "Top-down" it is flat. Default on phones: **the tilted first-person seat view** (RESOLVED Q23), at a gentler 30° tilt; Top-down is optional.

## 18.2 Laptop (1366×768 to 1920×1080)
- The full first-person scene: the table fills the centre, opponents' characters sit at 10, 12 and 2 o'clock, and own cards are large at the bottom.
- The right side panel (collapsible) holds the event log, scoreboard and the emote wheel.
- Mouse: hover lifts a card a little; drag and drop works for throw/swap; right-click opens a card's context menu (Match from here). Keyboard shortcuts in §15.2.
- The camera can "look around" by dragging an empty area or with arrow keys (mild, ±25°), like the reference. It springs back.

## 18.3 Seat geometry for 2, 3 and 4 players
- 2 players: the opponent directly across.
- 3 players: across-left and across-right (10 and 2 o'clock).
- 4 players: left, across and right.
- You are always at the bottom of your own screen.

---

# 19. Technology, delivery, helpers

## 19.1 Stack (all free / open source)
| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Monorepo | `pnpm` workspaces: `packages/engine`, `packages/bots`, `packages/protocol`, `apps/server`, `apps/client` |
| Client | Vite + React; **react-three-fiber + drei** for the table; HTML overlay for UI; Zustand for client state; i18next for strings |
| Animation | GSAP and/or react-spring; three.js post-processing (`postprocessing` library) |
| Audio | Howler.js |
| Server | Cloudflare Worker + Durable Object (SQLite storage), Hibernation WebSocket API; optionally `partyserver` + `partysocket` |
| Tests | Vitest (unit), fast-check (property tests), Playwright (multi-browser end-to-end), Miniflare/`wrangler dev` (local Worker) |
| CI/CD | GitHub Actions: test, then build, then deploy the client to GitHub Pages (`heisenberg0066/marlivo`); `wrangler deploy` the server (needs a `CLOUDFLARE_API_TOKEN` repo secret); a `windows-latest` job builds the **Tauri .exe** and attaches it to GitHub Releases |
| Assets | glTF pipeline with `gltf-transform`, KTX2 textures |

## 19.2 Installing on devices (RESOLVED Q24)
- **iPhone**: Safari, then Share, then "Add to Home Screen". The PWA opens full-screen with an icon. Audio unlock happens on the first tap.
- **Android**: Chrome, then "Install app" or "Add to Home screen" (the PWA install prompt). Full-screen, with haptics supported.
- **Windows**: a **desktop .exe** built by GitHub Actions with **Tauri** (MIT/Apache, small) on `windows-latest` and attached to GitHub Releases, matching his other apps. It loads the same web app, with no extra features. The PWA install from Edge/Chrome also works.

## 19.3 Memory helper (default OFF)
It's a memory game, so a helper changes the game. Options per room (host decides; everyone sees which mode is on):
- **Off** (default).
- **Training: own known cards**: shows a faint value ghost on your own cards you have legitimately seen (peeked, swapped in, Queen-peeked, revealed as wrong), and keeps tracking them through Jack swaps. Recommended only for practice vs bots or teaching new friends.
- **Full helper**: also shows ghosts for opponents' cards you've seen. Practice only.
- Computed **on the server** from the `knowledge` map, so it can't leak anything you didn't see.

---

# 20. Edge cases and proposed rulings

All rulings below follow Ammar's answers (v0.5) or follow directly from the confirmed rules. Nothing is open.

| # | Case | Ruling |
|---|---|---|
| E1 | A 10 is thrown when an opponent has 0 cards | Impossible: the round already ended when they reached 0 (§3.7) |
| E2 | A player reaches 0 through a Jack swap | Impossible: swaps keep counts the same |
| E3 | The last card is used in a match, and the matched card was a J/Q/10 | The round ends immediately; the power is not used |
| E4 | The turn player and another player could both finish on the same throw | Finish rule (R24, §5.3): if the other finishes first, the turn player may still try; if the turn player empties their area, they win |
| E5 | A player with 1 card left draws | Normal turn; they may swap with their single card. They can only empty their area by matching |
| E6 | A player matches their *own* throw (throw a 7, then match with their last 7) | Allowed (R14 "any player, in turn"). It's the usual way to win on your own turn |
| E7 | Deck empty when drawing | Reshuffle (R27), then draw |
| E8 | Deck empty when penalty cards are due | Reshuffle (only now that the deck is empty), keeping the target and open-match cards, then continue the penalty sequence (RESOLVED Q13/Q25) |
| E9 | Deck empty and nothing reshufflable when a penalty or 10 card is due | Last resort: reshuffle the kept target/open-match cards as well. Only if no card exists anywhere does the round end with no winner (RESOLVED Q25) |
| E10 | Same as E9 but it's a player's turn to draw | Same ruling: reshuffle whatever exists; no-winner end only with truly no cards (RESOLVED Q25) |
| E11 | The Jack thrower wants to swap two of their **own** cards | Allowed ("two cards of the same player"), e.g. to confuse opponents who saw them |
| E12 | A Queen when the table has no face-down cards | Not possible while the round is running (everyone has ≥1 card) |
| E13 | Matching a King (13) | Any combination summing to 13 (e.g. J+2, Q+A, 10+3, 6+4+2+A) |
| E14 | Matching an Ace (1) | Only a single Ace; nothing else can sum to 1 |
| E15 | A player claims, then cancels before the first flip | Allowed with no penalty (RESOLVED Q26). After the first flip, only Remove or Give up are allowed |
| E16 | A player flips the same card twice | Blocked by the UI and the server |
| E17 | A player is queued to match, then the target "disappears" (round ended) | The queue is cleared, with no penalty |
| E18 | A wrong card is flipped, then a Jack (from someone else) swaps that now-known card away | Fine: everyone saw it move; the knowledge map follows it |
| E19 | A player disconnects during their own DECIDE | Paused; they continue with the same drawn card when they rejoin. Optional host buttons: Replace with bot / Remove player / End game (§10.4) |
| E20 | Penalty cards push an area beyond the layout | The grid grows or scrolls (§18.1); no cap on cards |
| E21 | A 10 power with 3–4 players where the chosen opponent is disconnected | Allowed; the card is added to their area |
| E22 | The host leaves mid-match | Host migration (§10.3); the game continues |
| E23 | A player leaves permanently mid-round | The game stays paused until the host replaces them with a bot, removes them, or ends the game. If 1 human remains, "End game" is suggested |
| E24 | Two different players each want to match the same value with all their remaining cards | Server arrival order decides, except that the turn player always keeps the finish right (§5.3) |
| E25 | Someone tries to match while the current player is in DECIDE | Not possible: drawing closed the previous window. The Match button is hidden during DECIDE |
| E26 | A drawn card would match the previous throw | Not allowed: drawing closed that window; the drawn card can't be matched onto it or combined with it (R15b) |
| E27 | The swap target slot is an empty gap (removed card) | Not selectable; only occupied slots |
| E28 | Cards-per-player setting > 8 with 4 players | Blocked by the range (4–8) |
| E29 | A card that returned as wrong, or was removed | Counted once (2 cards). It can't be flipped again in the same attempt. On a give-up, each flipped card counts exactly once |
| E30 | Penalty cards during your own attempt | They arrive only when the attempt ends (R20), so they can't be used in it |
| E31 | No unflipped cards left and the set isn't exact | The attempt auto-fails; all flipped cards are wrong |
| E32 | The previous round's winner has left the match | The next active seat clockwise from them starts |
| E33 | Dice tie between 3 players for the highest | Only the tied players roll again, until one remains |
| E34 | A penalty or 10-power card when the receiver has no gaps | Random extra position at a random row end (§7.2) |
| E35 | A Jack "between two other opponents" with 2 players | Not possible; with 2 players it's own + opponent's, or two cards of the same player |
| E36 | Same player matches the same throw twice | Allowed (RESOLVED Q7); they re-claim and join the back of the queue |
| E37 | A player disconnects mid-attempt | Paused, no time limit. On rejoin: the attempt resumes unchanged. Only a host Replace/Remove cancels it, with no penalty (v0.6) |
| E38 | Two players pick the same character | Allowed (RESOLVED Q20); seat color rings tell them apart |
| E39 | A voice note arrives during an attempt or a power | It plays (unless muted); it never affects the game state |
| E40 | Someone tries a Test-room action in a normal room | Rejected by the server; logged (RESOLVED Q22) |
| E42 | Everyone disconnects | The paused game is kept; it resumes when players return. The room is deleted only after 7 days with nobody connected |
| E43 | A player drops in the lobby or on the round-end screen | No pause; the seat shows "disconnected" |
| E44 | The host drops | Paused as for anyone; any connected player may press "Take over host" |
| E45 | The host presses End game | The match ends for everyone; the scoreboard shows the current points, marked "Ended by host" |
| E41 | The turn player is disconnected during FINISH_PENDING | Paused until he rejoins; or the host replaces him with a bot (the bot decides) or removes him (X wins) |


---

# 21. Phased build plan and test plan

Each phase ends with a demo for Ammar and his sign-off before the next one starts. The time estimates are rough and assume focused agent-built work with Ammar reviewing.

## Phase 0: Setup (≈ ½ day)
- Repo `heisenberg0066/marlivo` (private until Ammar decides), monorepo skeleton, CI (lint + tests), GitHub Pages deploy of a "Hello table" page.
- **Ammar**: create a free Cloudflare account; add `CLOUDFLARE_API_TOKEN` (Workers edit) as a GitHub secret, or run `wrangler login` himself.
- Exit: CI is green, the Pages URL loads, `wrangler deploy` of an echo Worker works.

## Phase 1: Playable rules, solo practice and test tools (the "try it alone first" phase)
- **Engine**: every rule R1–R27 and §5 (windows, arrival-order queue, the turn-player finish rule, no timers), powers, penalties, reshuffle, scoring, every ruling in §20.
- **Server**: a Durable Object room with the protocol (§9), per-player projection, room code, basic lobby, simple reconnect.
- **Client (functional visuals)**: a top-down flat table, simple card art (original SVG), all screens in basic form, the Match/Remove/Give up/Skip flows, the event log. Simple animations (flip, fly) only.
- **Solo / test mode (§17)**: bots at Easy/Normal/Hard with speed settings and offline practice in a Web Worker; host test tools; the two-window test mode over the real Worker; the 3 placeholder characters (§14.6, simple 2D); the owner-only Test room (reveal all, step mode, forced deck presets, hand editor, seeded replay, event inspector, latency simulation, bot autoplay).
- English only in this phase (strings already go through i18n).
- **Exit criteria**: Ammar plays full matches against bots offline and in two windows online; every preset scenario in §17.3 behaves as he expects; normal rooms reject Test-room actions; the leak test passes; 10,000 bot-vs-bot games run without an engine error.

## Phase 2: "Back Room" look and feel (Liar's Bar-inspired Stage A)
- The three.js seat-view scene (table, lamp, room, post-processing), the camera modes, the 2D character busts with idle and reactions, first-person hand sprites.
- All animations in §16 with timing presets; the sound design; emotes and barks.
- Exit: Ammar reviews a recorded video of every animation, comments on timing, then approves.

## Phase 3: Friends-ready
- Privacy (required friends key, owner key, join password, lock, kick), robust reconnect with **pause-and-wait** (pause overlay, resume of in-progress attempts), the optional host buttons (Replace with bot, Remove player, End game), host hand-over, **chat with free text and voice notes** (§10.5), settings complete, the scoreboard and match-end stats, local match history.
- **French**, the accessibility pass (§15).
- PWA install on iPhone and Android, and the **Windows .exe** (Tauri) from GitHub Actions (RESOLVED Q24).
- Exit: a first real session with 2–3 friends; a feedback list.

## Phase 4: Polish and hardening
- Fixes from the playtest, performance on older iPhones (60 fps target, 30 fps minimum), the Low graphics mode, the provably-fair shuffle UI, the interactive tutorial.

## Phase 5: Full 3D characters (Stage B)
- The import pipeline for Ammar's GLB/FBX characters (§14.5), retargeting, look-at IK, seated animations, first-person arms, facial expressions, voice barks.
- Exit: all supplied characters animated for every clip in §14.5 on iPhone and laptop.

## 21.1 Test plan

**Engine unit tests (Vitest)**: one test per rule R1–R27 and per edge case E1–E45. Ammar's examples, written as literal tests:
- T=12: complete with 3 cards after 6 flips → 3 wrong → +6, dealt only after the attempt ends (Ammar's example).
- T=12: 7, 3, 5✗ (returns at once), 2 → played 7, 3, 2; 1 wrong → +2.
- T=12: 7, 3, 4✗, give up → 3 wrong → +6; all three back in their own slots, face down.
- T=12: 7, 2, 9✗, remove the 2, 5 → played 7+5; 2 wrong → +4.
- T=9: 5, 2, 1 with no cards left → auto-fail → +6.
- No penalty card appears mid-attempt; all are dealt at the end in one sequence.
- Start roll: forced dice 6, 6, 3 → only seats 1 and 2 re-roll; the highest then starts. Round 2 starts with the round-1 winner; a rematch rolls again.
- Jack: own + opponent's, two other opponents' (3 players), and two of the same player are all accepted; skip is accepted.
- Queen: skip needs a second confirm; a 10 has no skip (a skip intent is rejected).
- Placement: gaps filled first in reading order; with no gaps, a new slot at a random row's end (seeded); a new row when all rows are full.
- Round end reveals every remaining card to every seat.
- K matched with J+2 → the matcher gets a Jack power.
- A Jack thrown, 2 players, then the Jack is matched with a Jack: two Jack powers in landing order.
- A 10 with 2 players gives the card automatically to the opponent; with 3 players the thrower must choose.
- Claim order: P2's claim reaches the server 50 ms before P1's (the turn player), so P2 goes first. There is no turn-player head start.
- Finish rule: P1's turn; P2 empties his area first, so FINISH_PENDING. P1 tries and empties his area: P1 wins. P1 tries and fails: P2 wins. P1 lets it go: P2 wins. If P1 is the one who empties first, he wins immediately.
- R15b: after a draw, a claim on the previous throw is rejected, and the drawn card can't be combined with it.
- Q7: one player completes two matches on the same throw (a 9, then 5+4).
- Q8: give-up after flipping only the 5 of a planned 4+5 gives +2.
- Pause and wait (v0.6):
  - a drop mid-attempt pauses everyone, and every game intent is rejected while chat still works;
  - a rejoin after 1 minute, or after 5 hours, resumes the same attempt with the tentative set and penalty-due unchanged;
  - nothing changes while paused, however long;
  - the host's Replace with bot cancels the attempt with 0 penalty cards and the bot continues; Remove player and End game behave as in §10.4;
  - two disconnected players keep the game paused until both are back or handled.
- No timers: the engine has no timer actions at all, and a game left paused or idle for hours resumes unchanged.
- Out-of-turn finish: P3 holds only a J; P1 throws a J; P3 matches and wins immediately; P1's Jack power is discarded.
- Reshuffle happens only with an empty deck and keeps the target and open-match cards. With truly no cards anywhere, the round ends with no winner.
- Characters: two players with the same character are accepted.

**Property tests (fast-check)**: random action sequences from random states always keep these invariants:
- exactly 52 cards in the system (deck + pile + areas + drawn + tentative);
- no duplicate card;
- counts change only via match, penalty or 10;
- slot ids stay stable;
- a projection never contains hidden values for other seats;
- the game always reaches ROUND_END or a legal waiting state (no deadlock).

**Simulation / soak**: 10,000 bot games per difficulty mix. Measure: average round length, penalty rates, win rates by seat. Seat 1 shouldn't win far more than the others. If it does, discuss with Ammar (only as information; the rules don't change without him).

**Security "leak test"**: an automated test plays random games, captures every message sent to each seat, and asserts that none contains a rank/suit for a card that seat isn't entitled to at that moment. It also runs in CI on every commit.

**Server integration (Miniflare / `wrangler dev`)**: the room lifecycle, password and rate limits, reconnect with the seat token, hibernation wake-up with state restored from SQLite (including a paused room resumed after hours), two claims arriving in the same millisecond, a claim racing a draw, the required friends key, owner-key gating of the Test room, voice-note relay (size/length caps; the DO's storage holds no audio or chat after the match), and text chat escaping.

**Multi-client end-to-end (Playwright)**: 4 browser contexts in one test (Chromium + WebKit, which is close to iPhone Safari) play a scripted game using a forced deck; screenshots checked; latency injection of 0/150/500 ms; one client killed and restored mid-attempt.

**Device tests (manual checklist)**: iPhone (Safari and installed PWA; portrait and landscape; backgrounding and return; silent switch and audio; mic permission allow/deny; voice-note record and playback), Android phone (Chrome PWA install, voice notes), Windows laptop (the .exe, plus Edge and Chrome; touchpad, keyboard-only; mic), French screens (longer strings, no clipping), reduced motion, VoiceOver basics.

**Playtest protocol**: a short form after each session: confusing moments, unfair moments, favorite animation, bugs, plus an automatic error log with the seed for replay.

---

# 22. Decisions log (all questions resolved)

**There are no open questions.** All 26 were answered by Ammar (v0.2–v0.5); v0.6 refined Q5/Q8: disconnects pause and wait, with no timer.

1. **Q1 Name**: **MarLivo** (Ammar + Liv/"Livooo"); slug `marlivo`.
2. **Q2 Wrong card**: wrong if it doesn't end up in the final exact combination; 2 penalty cards each, dealt at the end of the attempt; give up or out of cards: every flipped card is wrong.
3. **Q3 Who starts**: round 1 by dice (ties re-roll among the tied); later rounds: the last round's winner.
4. **Q4 Matching priority**: none; server arrival order. Only exception: the turn-player finish rule (§5.3).
5. **Q5 Timers**: none anywhere, including no reconnect countdown (v0.6); nothing is ever auto-played.
6. **Q6 Targets**: all matches on a throw target its value; the next draw closes it; a drawn card can't match or combine with the previous throw.
7. **Q7 Several matches**: yes, the same player may match the same throw several times.
8. **Q8 Disconnect / give-up**: a disconnect pauses the game for everyone with no time limit (v0.6). The player rejoins whenever he wants and resumes exactly, including an in-progress attempt. Optional host buttons: Replace with bot, Remove player, End game (a replace or remove cancels an attempt with no penalty). A give-up counts only cards actually flipped.
9. **Q9 Power cursor**: others always see it.
10. **Q10 Jack**: any two face-down cards (own + opponent's, two other opponents', or two of one player); optional.
11. **Q11 Powers**: Queen optional, with peeking as the obvious default; 10 mandatory.
12. **Q12 Placement**: gaps first, then a random extra position (new slot at a random row's end).
13. **Q13 Reshuffle**: only when the deck is completely empty; the target and open-match cards stay on the pile.
14. **Q14 Access**: a friends key (password) is required to create rooms; optional join password.
15. **Q15 Chat**: emojis, preset phrases, free text and voice notes (≤30 s, relayed, never stored after the match), with mic permission handling and mute options.
16. **Q16 Round end**: always reveal all remaining cards.
17. **Q17 Screenshots**: no protection.
18. **Q18 Initial peek**: each player chooses any 2 of their own cards.
19. **Q19 Mood**: friendly, cosy back room; Liar's Bar only for camera and animation feel.
20. **Q20 Characters**: Ammar supplies several later; picked before each game, duplicates allowed; 3 placeholders now (§14.6).
21. **Q21 Languages / card names**: English + French; card names English only (J/Q/K/A).
22. **Q22 Bots / test tools**: bots for everyone; hosts get bots and safe test tools; reveal-all and deck forcing only in an owner-key Test room.
23. **Q23 Phone camera**: tilted first-person seat view by default.
24. **Q24 Install**: PWA for iPhone and Android, plus a Windows .exe from GitHub Actions.
25. **Q25 Empty deck**: reshuffle the thrown pile and continue; no-winner end only with truly no cards anywhere.
26. **Q26 Cancel a claim**: allowed before the first flip, no penalty.

---

# 23. What Ammar needs to do (only things an agent can't)
1. Nothing left to decide (§22). Review the v0.5 spec once more before Phase 0.
2. Create a free Cloudflare account and grant deploy access (a GitHub secret or `wrangler login`). Choose the **friends key** and the **owner key**; they are set as Worker secrets `FRIENDS_KEY` and `OWNER_KEY` (I never see them if he enters them himself with `wrangler secret put`).
3. Later: supply the character models (§14.5) and optionally friends' voice barks.
4. Share the room link with friends; no accounts needed.

# Appendix A. Name

**Decided: MarLivo.** The name combines **Ammar** ("Mar") and his best friend **Liv** / "Livooo" ("Livo"). Casing: capital M, capital L. Slug: `marlivo`.

Other candidates that were considered (for the record): Livooo, AmLiv, Livmar, Livooo's Table, Club Livooo. Earlier v0.1 ideas: Mamba Screw, Mamba Snap, Mamba Blind, Mamba Jack, Mamba Bar / Mamba Back Room, Mamba Thirteen.

*End of spec v0.6.*
