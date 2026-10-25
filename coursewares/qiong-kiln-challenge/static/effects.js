/* Presentation only: source-image coordinates match the scene's object-fit: cover. */
(function (root) {
  'use strict';
  const WIDTH = 1672, HEIGHT = 941, FPS = 30, MAX_DPR = 1.5;
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  function frame(width, height) {
    const scale = Math.max(width / WIDTH, height / HEIGHT);
    return { scale, x: (width - WIDTH * scale) / 2, y: (height - HEIGHT * scale) / 2 };
  }
  function visual(state) {
    const s = state.kiln;
    const phase = state.training ? 'training' : s.done ? s.success ? 'success' : s.damaged ? 'damaged' : 'ended'
      : !s.tick ? 'ready' : state.lastAction === 2 ? 'cooling' : state.lastAction === 1 ? 'holding' : 'heating';
    const fire = state.training || s.success ? 0 : clamp((s.temp - 30) / 55) * (state.lastAction === 2 ? 0.45 : 1);
    return { phase, fire, maturity: clamp(s.maturity / 3), heat: clamp(s.temp / 100),
      active: state.initialized && state.view === 'lab' && !state.training,
      paused: state.mode === 'ai' && !state.running && !s.done };
  }
  function mount(scene, badge) {
    const canvas = document.createElement('canvas');
    canvas.id = 'kilnEffects'; canvas.className = 'kiln-effects'; canvas.setAttribute('aria-hidden', 'true');
    scene.append(canvas);
    const ctx = canvas.getContext('2d'), media = root.matchMedia('(prefers-reduced-motion: reduce)');
    let state = null, v = null, previous = null, raf = 0, last = 0, clock = 0, pulse = 0;
    let width = 0, height = 0, dpr = 1, disposed = false, frames = 0;
    const mouth = new Path2D('M727 560 L736 457 Q745 386 814 365 Q911 330 972 383 Q1017 418 1020 560 Z');
    const pot = new Path2D('M840 406 Q878 400 918 407 L914 415 Q900 425 918 438 C967 458 956 516 931 549 L929 561 L835 561 L831 549 C797 512 799 461 836 440 Q857 429 846 416 Z');
    const labels = {ready: '', training: '', heating: '加热', holding: '保持火候', cooling: '降温', success: '烧成合格', damaged: '过热损坏', ended: '本窑结束'};
    function allowed() {
      return !disposed && v?.active && !v.paused && !media.matches && !document.hidden && !document.querySelector('dialog[open]');
    }
    function moving() { return allowed() && (v.fire > 0.01 || pulse > 0.01); }
    function resize() {
      const rect = scene.getBoundingClientRect();
      width = rect.width; height = rect.height; dpr = Math.min(root.devicePixelRatio || 1, MAX_DPR);
      if (!width || !height) return;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      const f = frame(width, height);
      badge.style.left = `${f.x + 879 * f.scale}px`; badge.style.top = `${f.y + 314 * f.scale}px`;
      draw(); wake();
    }
    function stroke(path, color, size) { ctx.strokeStyle = color; ctx.lineWidth = size; ctx.stroke(path); }
    function fire(t) {
      const power = v.fire;
      if (power <= 0.01) return;
      // Exclude the jar from the fire layer, leaving the real artifact visible.
      ctx.save();
      const fireArea = new Path2D(mouth); fireArea.addPath(pot); ctx.clip(fireArea, 'evenodd');
      const glow = ctx.createLinearGradient(0, 565, 0, 352);
      glow.addColorStop(0, `rgba(255,132,20,${0.35 * power})`); glow.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = glow; ctx.fillRect(725, 350, 300, 215);
      for (let i = 0; i < 19; i++) {
        const x = 735 + i * 15, sway = Math.sin(t * 3.5 + i * 2.1) * 16, half = 9 + i % 4 * 2;
        const h = (24 + power * (59 + i % 5 * 12)) * (0.72 + 0.25 * Math.sin(t * 5 + i * 1.7));
        const flame = new Path2D(); flame.moveTo(x - half, 566);
        flame.bezierCurveTo(x - half * 2, 555 - h * 0.3, x + sway - 8, 560 - h * 0.65, x + sway, 560 - h);
        flame.bezierCurveTo(x + sway - 5, 560 - h * 0.4, x + half * 2, 555 - h * 0.18, x + half, 566);
        const g = ctx.createLinearGradient(0, 566, 0, 560 - h);
        g.addColorStop(0, `rgba(255,244,160,${power * 0.95})`); g.addColorStop(0.5, `rgba(255,159,32,${power * 0.8})`); g.addColorStop(1, 'rgba(246,71,8,0)');
        ctx.fillStyle = g; ctx.fill(flame);
      }
      for (let i = 0; i < 16; i++) {
        const age = (t * (0.28 + i % 3 * 0.06) + i * 0.618) % 1;
        const x = 742 + (i * 37 % 260) + Math.sin(age * 5 + i) * 12, y = 558 - age * 182;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y + 3);
        ctx.strokeStyle = `rgba(255,215,113,${power * (1 - age)})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
      ctx.save(); ctx.clip(mouth); ctx.globalAlpha = power * 0.16;
      for (let i = 0; i < 4; i++) {
        const x = 754 + i * 77;
        ctx.beginPath(); ctx.moveTo(x, 538); ctx.bezierCurveTo(x + Math.sin(t * 2 + i) * 13, 486, x - 8, 441, x + 5, 392);
        ctx.strokeStyle = '#ffe9b1'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    }
    function smoke(t) {
      if (v.fire <= 0.01) return;
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const start = 864 + i * 6, drift = Math.sin(t * 0.65 + i * 0.4) * 28;
        ctx.beginPath(); ctx.moveTo(start, 172);
        ctx.bezierCurveTo(start - 13 + drift * 0.3, 128, start + 34 + drift, 102, start + drift, 68);
        ctx.bezierCurveTo(start - 25 + drift, 38, start + 15 + drift, 18, start + drift * 1.5, -15);
        const fade = ctx.createLinearGradient(0, 170, 0, 0);
        fade.addColorStop(0, `rgba(231,234,225,${v.fire * 0.11})`); fade.addColorStop(1, 'rgba(243,244,239,0)');
        ctx.strokeStyle = fade; ctx.lineWidth = 5 + i * 2; ctx.lineCap = 'round'; ctx.stroke();
      }
      ctx.restore();
    }
    function pottery(t) {
      ctx.save(); ctx.clip(pot);
      if (v.maturity > 0 && v.phase !== 'damaged') {
        const x = 788 + (t * 30 % 190), g = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
        g.addColorStop(0, 'rgba(255,255,229,0)'); g.addColorStop(0.5, `rgba(255,255,229,${v.maturity * 0.18})`); g.addColorStop(1, 'rgba(255,255,229,0)');
        ctx.fillStyle = g; ctx.fillRect(800, 405, 160, 160);
      }
      if (v.phase === 'damaged') {
        ctx.fillStyle = 'rgba(72,37,24,.16)'; ctx.fillRect(800, 405, 160, 160);
        stroke(new Path2D('M881 419 L872 447 L891 463 L872 489 L885 516 L877 543 M890 463 L916 471 L922 490 M872 489 L843 500 L838 516'), 'rgba(75,48,35,.78)', 2.1);
      }
      if (v.phase === 'success') {
        ctx.globalAlpha = 0.3 + pulse * (0.1 + 0.1 * Math.sin(t * 2));
        stroke(new Path2D('M849 408 Q879 403 910 408 M835 456 Q818 482 834 518'), '#fffbd4', 3);
      }
      ctx.restore();
    }
    function cooling(t) {
      if (v.phase !== 'cooling' || pulse <= 0) return;
      ctx.save(); ctx.clip(mouth);
      for (let i = 0; i < 4; i++) {
        const x = 726 + ((t * 100 + i * 72) % 280), y = 420 + i * 33;
        ctx.beginPath(); ctx.moveTo(x - 24, y + 7); ctx.quadraticCurveTo(x, y - 7, x + 22, y);
        ctx.strokeStyle = `rgba(204,246,247,${pulse * 0.42})`; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    }
    function draw() {
      if (!v || !width || !height) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!v.active) return;
      const f = frame(width, height); ctx.setTransform(dpr * f.scale, 0, 0, dpr * f.scale, dpr * f.x, dpr * f.y);
      fire(clock); smoke(clock); pottery(clock); cooling(clock); frames++;
      canvas.dataset.frames = String(frames);
    }
    function stop() { if (raf) root.cancelAnimationFrame(raf); raf = 0; last = 0; canvas.dataset.animating = 'false'; }
    function loop(now) {
      raf = 0;
      if (!moving()) { stop(); return; }
      const delta = last ? now - last : 1000 / FPS;
      if (delta >= 1000 / FPS - 1) {
        const dt = Math.min(delta / 1000, 0.08); clock += dt; pulse = Math.max(0, pulse - dt / 2.4);
        last = now; draw();
      }
      raf = root.requestAnimationFrame(loop);
    }
    function wake() {
      if (moving()) { if (!raf) { canvas.dataset.animating = 'true'; raf = root.requestAnimationFrame(loop); } }
      else stop();
    }
    function sync(next) {
      state = next; v = visual(state);
      const s = state.kiln;
      if (!previous || s.tick < previous.tick || state.mode !== previous.mode) { clock = 0; pulse = 0; }
      if (s.tick > (previous?.tick || 0)) pulse = 1;
      previous = {tick: s.tick, mode: state.mode};
      canvas.dataset.phase = v.phase;
      badge.dataset.phase = v.phase; badge.hidden = !v.active || !labels[v.phase];
      badge.textContent = labels[v.phase];
      scene.setAttribute('aria-label', `邛窑虚拟窑场，${labels[v.phase] || '等待操作'}，烧成进度${s.maturity}/3`);
      draw(); wake();
    }
    const observer = new ResizeObserver(resize); observer.observe(scene);
    const onVisibility = () => wake();
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('toggle', onVisibility, true); media.addEventListener('change', onVisibility);
    function destroy() {
      disposed = true; stop(); observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('toggle', onVisibility, true); media.removeEventListener('change', onVisibility);
    }
    root.addEventListener('pagehide', stop); root.addEventListener('pageshow', onVisibility);
    return {sync, destroy() { destroy(); root.removeEventListener('pagehide', stop); root.removeEventListener('pageshow', onVisibility); }};
  }
  root.KilnEffects = {frame, visual, mount, FPS, MAX_DPR};
  if (typeof module !== 'undefined') module.exports = root.KilnEffects;
})(typeof window !== 'undefined' ? window : globalThis);
