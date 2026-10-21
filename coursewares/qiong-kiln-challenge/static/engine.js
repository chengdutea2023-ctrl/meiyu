/* Browser-local educational simulation. Values are heat indices, never kiln recipes. */
(function (root) {
  'use strict';
  const ACTIONS = ['加热', '保持', '降温'];
  const DEFAULT_REWARDS = { success: 100, damage: 80, energy: 1, time: 1 };
  function random(seed) {
    let x = seed >>> 0;
    return () => { x += 0x6D2B79F5; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function create(seed = 21, disturbance = 2) {
    return { temp: 20, maturity: 0, tick: 0, energy: 0, done: false, success: false, damaged: false,
      reason: '', totalReward: 0, disturbance, rng: random(seed), trace: [{ tick: 0, temp: 20, maturity: 0, action: null, energy: 0, reward: 0 }] };
  }
  function key(s) { return `${Math.round(s.temp / 5)}:${s.maturity}:${s.tick}`; }
  function step(s, action, rewards = DEFAULT_REWARDS) {
    if (s.done) return { reward: 0, done: true };
    if (![0, 1, 2].includes(action)) throw new Error('Invalid action');
    const previousMaturity = s.maturity;
    const energy = [5, 2, 0][action];
    s.temp = Math.max(0, Math.min(100, s.temp + [18, -2, -16][action] + (s.rng() * 2 - 1) * s.disturbance));
    s.energy += energy; s.tick++;
    if (s.temp >= 58 && s.temp <= 80) s.maturity = Math.min(3, s.maturity + 1);
    s.damaged = s.temp >= 94;
    s.success = !s.damaged && s.maturity >= 3 && s.temp <= 35;
    s.done = s.success || s.damaged || s.tick >= 22;
    s.reason = s.success ? '烧成合格' : s.damaged ? '过热损坏' : s.done ? (s.maturity < 3 ? '烧成不足' : '尚未冷却') : '';
    let reward = -energy * rewards.energy - rewards.time;
    // Dense reward helps students observe learning in a short classroom session.
    reward += (s.maturity - previousMaturity) * rewards.success * 0.08;
    if (s.done) reward += s.success ? rewards.success : s.damaged ? -rewards.damage : -rewards.damage * 0.5;
    s.totalReward += reward;
    s.trace.push({ tick: s.tick, temp: +s.temp.toFixed(2), maturity: s.maturity, action, energy: s.energy, reward: +reward.toFixed(2) });
    return { reward, done: s.done };
  }
  function fixed(s) { return s.maturity >= 3 ? 2 : s.temp < 65 ? 0 : 1; }
  function values(q, s) { return q[key(s)] || [0, 0, 0]; }
  function choose(q, s, rng, epsilon = 0) {
    if (rng() < epsilon) return Math.floor(rng() * 3);
    const row = values(q, s), best = Math.max(...row), ties = row.map((v, i) => v === best ? i : -1).filter(i => i >= 0);
    return ties[Math.floor(rng() * ties.length)];
  }
  function episode(q, index, rewards, seed = 815, disturbance = 2, total = 3000) {
    const rng = random(seed + index * 109), s = create(seed + index * 67, disturbance);
    const epsilon = 0.08 + 0.82 * Math.pow(1 - Math.min(index / total, 1), 2);
    while (!s.done) {
      const k = key(s), a = choose(q, s, rng, epsilon);
      const { reward } = step(s, a, rewards);
      const next = s.done ? 0 : Math.max(...values(q, s));
      if (!q[k]) q[k] = [0, 0, 0];
      q[k][a] += 0.24 * (reward + 0.97 * next - q[k][a]);
    }
    return s;
  }
  // Disjoint from all training environment seeds (815 + 67*i, i < 8000).
  const EVAL_SEEDS = Array.from({ length: 30 }, (_, i) => 1330001 + i * 47);
  function evaluate(q, mode, rewards = DEFAULT_REWARDS, disturbance = 2) {
    const runs = EVAL_SEEDS.map(seed => {
      const s = create(seed, disturbance), rng = random(seed + 9);
      while (!s.done) step(s, mode === 'fixed' ? fixed(s) : choose(q, s, rng), rewards);
      return s;
    });
    return { samples: runs.length, rate: Math.round(runs.filter(s => s.success).length / runs.length * 100),
      energy: +(runs.reduce((sum, s) => sum + s.energy, 0) / runs.length).toFixed(1),
      steps: +(runs.reduce((sum, s) => sum + s.tick, 0) / runs.length).toFixed(1),
      reward: +(runs.reduce((sum, s) => sum + s.totalReward, 0) / runs.length).toFixed(1) };
  }
  root.KilnEngine = { ACTIONS, DEFAULT_REWARDS, random, create, key, step, fixed, values, choose, episode, evaluate, EVAL_SEEDS };
  if (typeof module !== 'undefined') module.exports = root.KilnEngine;
})(typeof window !== 'undefined' ? window : globalThis);
