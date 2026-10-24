// Unit tests for the 3D Orange waiter: outfits, the 60 s shift / 60 s break cycle, the walking plan round the whole
// table (behind the chairs, beside every player to pour, out through the off-screen exit) and the walking gait
// (stride tied to the distance walked: planted feet do not slide, no stepping in place, no running).
import { describe, it, expect } from 'vitest';
import { layout3, TABLE_R } from '../src/render3d/layout3d';
import { propLayout } from '../src/render3d/scenes/propLayout';
import { TEA_DRAIN, teaLevel, refillTea, setTeaLevel, tickTea } from '../src/render3d/scenes/tea';
import {
  WAITER_OUTFITS,
  OUTFIT_ORDER,
  waiterOutfitForCycle,
  evaluateWaiterCycle,
  pickWaiterOutfit,
  pickRefillOrder,
  cupStopForSeat,
  waiterObstacles,
  waiterClearance,
  seatClearances,
  obstacleDist,
  WALK_MARGIN,
  WAITER_BODY_R,
  WALK_SPEED,
  buildShiftPlan,
  buildEventPlan,
  samplePlan,
  planClearance,
  legGeomFrom,
  walkPose,
  footPath,
  legIK,
  strideOf,
  cadenceOf,
  GAIT,
  KITCHEN_DOOR,
  WALK_R,
  WALK_SPEED_RANGE,
  WAITER_FLOOR_Y,
  WAITER_SCALE,
  WAITER_ACTIVE_SEC,
  WAITER_AWAY_SEC,
  WAITER_CYCLE_SEC,
  POUR_MIN,
  POUR_MAX,
  HEDGE_Z,
  type WaiterOutfit,
} from '../src/render3d/scenes/waiterPath';
import { FLOOR_Y } from '../src/render3d/sceneConfig';

const view = (n: number, me = 0) => ({
  you: me,
  seats: Array.from({ length: n }, () => ({})),
  players: Array.from({ length: n }, (_, i) => i),
  round: null,
} as never);

// orange-guy.glb leg bones in body space (normalised to 0.80 high): hip -> knee 0.12, knee -> ankle 0.098
const G = legGeomFrom([-0.124, 0.256, -0.063], [-0.124, 0.136, -0.063], [-0.124, 0.04, -0.043]);

describe('Orange waiter: outfits, shift / break cycle, walking plan round the table, walking gait', () => {
  it('rotates through all 6 outfits per shift and never repeats the previous outfit', () => {
    expect(WAITER_OUTFITS.length).toBeGreaterThanOrEqual(6);
    expect(OUTFIT_ORDER).toEqual(WAITER_OUTFITS);
    for (let i = 0; i < 12; i++) {
      expect(waiterOutfitForCycle(i)).toBe(OUTFIT_ORDER[i % OUTFIT_ORDER.length]);
      expect(waiterOutfitForCycle(i + 1)).not.toBe(waiterOutfitForCycle(i));
    }
    let s = 42;
    const rng = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    const picks = Array.from({ length: 100 }, () => pickWaiterOutfit(rng));
    for (const o of WAITER_OUTFITS) expect(picks).toContain(o);
    let prev: WaiterOutfit = 'full';
    for (let i = 0; i < 120; i++) { const next = pickWaiterOutfit(rng, prev); expect(next).not.toBe(prev); prev = next; }
  });

  it('nominal cycle: 60 s shift then 60 s off-screen break; tea drains and refills', () => {
    expect(WAITER_ACTIVE_SEC).toBe(60);
    expect(WAITER_AWAY_SEC).toBe(60);
    expect(WAITER_CYCLE_SEC).toBe(120);
    expect(evaluateWaiterCycle(5).active).toBe(true);
    expect(evaluateWaiterCycle(30).progress).toBeCloseTo(0.5, 3);
    expect(evaluateWaiterCycle(75).active).toBe(false);
    expect(evaluateWaiterCycle(135).cycleIndex).toBe(1);
    expect(evaluateWaiterCycle(135).outfit).toBe(OUTFIT_ORDER[1]);
    expect(TEA_DRAIN.minutes).toBeLessThanOrEqual(2);
    setTeaLevel(0, 0.58);
    expect(teaLevel(0)).toBeCloseTo(0.58, 2);
    refillTea(0);
    tickTea(10, 2.0, [0]);
    expect(teaLevel(0)).toBeGreaterThan(0.85);
  });

  it('stands on the terrace floor, about as tall as the badminton Orange guys; the exit is outside the walking ring', () => {
    expect(WAITER_FLOOR_Y).toBe(FLOOR_Y);
    expect(0.8 * WAITER_SCALE).toBeGreaterThan(1.0);
    expect(0.8 * WAITER_SCALE).toBeLessThan(1.25);
    expect(Math.hypot(KITCHEN_DOOR[0], KITCHEN_DOOR[2])).toBeGreaterThan(WALK_R + 1);
    expect(Math.hypot(KITCHEN_DOOR[0], KITCHEN_DOOR[2])).toBeLessThan(3.56); // still on the paved terrace
  });

  for (const n of [2, 3, 4]) {
    for (const portrait of [false, true]) {
      it(`${n} players${portrait ? ' (phone)' : ''}: one shift walks round the whole table, pours every cup beside its player, never touches table / chairs / players`, () => {
        const L = layout3(view(n, 0), false, portrait);
        const P = propLayout(L);
        const plan = buildShiftPlan(L, P.tea);
        // about one minute, all of it spent walking or pouring
        expect(plan.total).toBeGreaterThan(50);
        expect(plan.total).toBeLessThanOrEqual(WAITER_ACTIVE_SEC + 20); // about a minute (a calm pace needs a bit more for 4)
        expect(plan.speed).toBeGreaterThanOrEqual(WALK_SPEED_RANGE[0]);
        expect(plan.speed).toBeLessThanOrEqual(WALK_SPEED_RANGE[1]);
        expect(plan.pour).toBeGreaterThanOrEqual(POUR_MIN);
        expect(plan.pour).toBeLessThanOrEqual(POUR_MAX);
        // every seated player's cup is poured at least once, standing beside that player
        const pours = plan.segs.filter((s) => s.k === 'hold' && s.tag === 'pour');
        expect(new Set(pours.map((s) => (s as { seat?: number }).seat)).size).toBe(n);
        expect(pickRefillOrder(L, Object.keys(P.tea).map(Number))).toHaveLength(n);
        const obs = waiterObstacles(L);
        for (const st of plan.stops) {
          const c = L.chars[st.seat]!.p;
          const r = Math.hypot(st.standPos[0], st.standPos[2]);
          expect(r).toBeGreaterThan(TABLE_R + 0.07 + 0.3); // body never over the table
          expect(Math.hypot(st.standPos[0] - c[0], st.standPos[2] - c[2])).toBeLessThan(1.45); // beside the player (in the gap next to them)
          expect(waiterClearance(obs, st.standPos[0], st.standPos[2])).toBeGreaterThanOrEqual(WALK_MARGIN - 1e-9);
          expect(st.standPos[2]).toBeGreaterThan(HEDGE_Z);
          // the cup he pours is that player's own cup
          expect(st.face[0]).toBeCloseTo(P.tea[st.seat]!.p[0], 6);
        }
        // the whole route keeps clear of the table rim, every chair and every seated player
        expect(planClearance(L, plan, 0.02)).toBeGreaterThanOrEqual(WALK_MARGIN - 0.005);
        // invariant per seat: every path point keeps his body WALK_MARGIN clear of that seat's chair box and body circle
        const per = seatClearances(L, plan);
        expect(Object.keys(per)).toHaveLength(n);
        for (const v of Object.values(per)) expect(v).toBeGreaterThanOrEqual(WALK_MARGIN - 0.005);
        console.log(`clearance ${n}p${portrait ? ' phone' : ''}: total ${plan.total.toFixed(1)} s, speed ${plan.speed.toFixed(3)}, pour ${plan.pour.toFixed(2)}, per seat ` + JSON.stringify(Object.fromEntries(Object.entries(per).map(([k, v]) => [k, +v.toFixed(3)]))));
        // starts and ends at the exit, goes all the way round the table (angle swept >= one lap)
        const a = samplePlan(plan, 0), z = samplePlan(plan, plan.total);
        expect(Math.hypot(a.x - KITCHEN_DOOR[0], a.z - KITCHEN_DOOR[2])).toBeLessThan(1e-6);
        expect(Math.hypot(z.x - KITCHEN_DOOR[0], z.z - KITCHEN_DOOR[2])).toBeLessThan(1e-6);
        let swept = 0, prevA = Math.atan2(a.x, a.z), prev = a, maxV = 0, minR = 9;
        for (let t = 0.05; t <= plan.total; t += 0.05) {
          const s = samplePlan(plan, t);
          const an = Math.atan2(s.x, s.z);
          let d = an - prevA; d = Math.atan2(Math.sin(d), Math.cos(d)); swept += d; prevA = an;
          // continuous motion: no jumps, never faster than a calm walk
          maxV = Math.max(maxV, Math.hypot(s.x - prev.x, s.z - prev.z) / 0.05);
          minR = Math.min(minR, Math.hypot(s.x, s.z));
          // speed reported by the plan matches the real motion; standing still only while pouring
          if (!s.moving) expect(s.tag === 'pour' || s.speed < 1e-3).toBe(true);
          prev = s;
        }
        expect(Math.abs(swept)).toBeGreaterThan(Math.PI * 2 * 0.9);
        expect(maxV).toBeLessThan(WALK_SPEED_RANGE[1] + 0.02);
        expect(minR).toBeGreaterThan(TABLE_R + 0.4);
      });
    }
  }

  it('event visits (cheer / medal) start and end on the same spot, so the shift carries on without a jump', () => {
    const L = layout3(view(4, 0), false, false);
    const P = propLayout(L);
    const st = cupStopForSeat(L, 2, P.tea[2]!.p);
    const from: [number, number] = [st.standPos[0], st.standPos[2]];
    const ev = buildEventPlan(from, [cupStopForSeat(L, 3, P.tea[3]!.p).standPos[0], cupStopForSeat(L, 3, P.tea[3]!.p).standPos[2]], [1.2, 0], 5, 'cheer', from, 3);
    const s0 = samplePlan(ev, 0), s1 = samplePlan(ev, ev.total);
    expect(Math.hypot(s0.x - from[0], s0.z - from[1])).toBeLessThan(1e-6);
    expect(Math.hypot(s1.x - from[0], s1.z - from[1])).toBeLessThan(1e-6);
    expect(planClearance(L, ev, 0.02)).toBeGreaterThanOrEqual(WALK_MARGIN - 0.005);
  });

  it('walking gait: feet planted on the ground do not slide, stride follows speed, no running (no flight phase)', () => {
    const v = WALK_SPEED;
    const cad = cadenceOf(G, v);
    // stride per cycle = 2 x leg length x ~0.6-0.7; calm cadence 1.6-1.9 steps / s over the whole pace range
    const leg = G.l1 + G.l2;
    expect(strideOf(G) / (2 * leg)).toBeGreaterThan(0.55);
    expect(strideOf(G) / (2 * leg)).toBeLessThan(0.72);
    for (const sp of [...WALK_SPEED_RANGE, v]) {
      expect(cadenceOf(G, sp) * 2).toBeGreaterThanOrEqual(1.6);
      expect(cadenceOf(G, sp) * 2).toBeLessThanOrEqual(1.9);
    }
    console.log(`cadence: ${(cad * 2).toFixed(2)} steps/s at ${v} u/s (range ${WALK_SPEED_RANGE.map((x) => (cadenceOf(G, x) * 2).toFixed(2)).join('-')}), stride ${(strideOf(G) * WAITER_SCALE).toFixed(3)} u per cycle, leg ${(leg * WAITER_SCALE).toFixed(3)} u`);
    expect(strideOf(G) * WAITER_SCALE).toBeGreaterThan(0.25);
    // thigh swing stays within a walk (no big running kicks)
    let maxHip = 0, minDown = 1, airborne = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const c = i / N;
      const p = walkPose(G, c, 1);
      maxHip = Math.max(maxHip, Math.abs(p.L.hipPitch), Math.abs(p.R.hipPitch));
      if (!p.footL.stance && !p.footR.stance) airborne++;
      minDown = Math.min(minDown, p.bodyY);
      // a planted foot moves backwards relative to the body at exactly the body's speed (so it is still on the ground)
      const dc = 1 / N;
      const a = footPath(c, strideOf(G)), b = footPath(c + dc, strideOf(G));
      if (a.stance && b.stance) expect((a.f - b.f) / dc).toBeCloseTo(strideOf(G), 6);
    }
    expect(airborne).toBe(0);
    expect(maxHip).toBeLessThan(0.75);
    expect(minDown).toBeGreaterThan(-0.04);
    expect(GAIT.duty).toBeGreaterThan(0.5); // a foot is down more than half the time: walking, not running
    // the IK puts the ankle where the foot path wants it (stance feet stay on the floor)
    const p = walkPose(G, 0.3, 1);
    const fp = footPath(0.3, strideOf(G));
    const ik = legIK(G, fp.f, G.depth + p.bodyY);
    const ax = G.l1 * Math.sin(ik.thigh) + G.l2 * Math.sin(ik.shin);
    const ay = G.l1 * Math.cos(ik.thigh) + G.l2 * Math.cos(ik.shin);
    expect(ax).toBeCloseTo(fp.f, 3);
    expect(ay).toBeCloseTo(G.depth + p.bodyY, 3);
    // standing still: exactly the rest pose (no stepping in place)
    const still = walkPose(G, 0.37, 0);
    for (const leg of [still.L, still.R]) { expect(leg.hipPitch).toBeCloseTo(0, 9); expect(leg.kneeBend).toBeCloseTo(0, 9); expect(leg.footPitch).toBeCloseTo(0, 9); }
    expect(still.bodyY).toBeCloseTo(0, 9);
  });
});
