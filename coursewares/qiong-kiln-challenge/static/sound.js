/* Local synthesized fire: no downloads, autoplay, or simulation randomness. */
(function (root) {
  'use strict';
  function samples(rate, seconds = 4) {
    const out = new Float32Array(Math.floor(rate * seconds));
    let seed = 719, low = 0, crackle = 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < out.length; i++) {
      const noise = random() * 2 - 1;
      low = low * 0.97 + noise * 0.03;
      if (random() < 10 / rate) crackle = 0.12 + random() * 0.35;
      crackle *= Math.exp(-1 / (rate * 0.008));
      const edge = Math.min(1, i / (rate * 0.04), (out.length - 1 - i) / (rate * 0.04));
      out[i] = (low * 1.8 + crackle * noise) * edge;
    }
    return out;
  }
  function level(state) {
    if (!state || !state.initialized || state.view !== 'lab' || state.training || state.locked || state.kiln.done
      || (state.mode === 'ai' && !state.running)) return 0;
    return Math.max(0, Math.min(1, (state.kiln.temp - 30) / 55)) * (state.lastAction === 2 ? 0.35 : 1);
  }
  function mount(button) {
    let context, source, gain, current, enabled = true, disposed = false;
    const Audio = root.AudioContext || root.webkitAudioContext;
    function buttonState() {
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', enabled ? '关闭烧火音效' : '开启烧火音效');
      button.title = enabled ? '关闭烧火音效' : '开启烧火音效';
      const path = `icons/${enabled ? 'speaker-high' : 'speaker-slash'}.svg`;
      button.querySelector('img').src = root.KILN_ASSETS?.[path] || './' + path;
    }
    function sync(state = current) {
      current = state;
      const amount = enabled && !document.hidden && !document.querySelector('dialog[open]') ? level(state) : 0;
      button.dataset.level = String(amount);
      if (!context || disposed) return;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(amount * 0.22, context.currentTime, 0.06);
      if (amount && context.state === 'suspended') context.resume().catch(() => {});
    }
    async function unlock() {
      if (!enabled || disposed || !Audio) return;
      try {
        if (!context) {
          context = new Audio(); gain = context.createGain(); gain.gain.value = 0;
          const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
          buffer.copyToChannel(samples(context.sampleRate), 0);
          source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
          const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2200;
          source.connect(filter); filter.connect(gain); gain.connect(context.destination); source.start();
        }
        await context.resume(); sync();
      } catch {
        enabled = false; buttonState(); sync();
      }
    }
    const gesture = event => {
      if (event.type === 'pointerdown' || event.key === 'Enter' || event.key === ' ') void unlock();
    };
    const toggle = () => { enabled = !enabled; buttonState(); if (enabled) void unlock(); sync(); };
    const visibility = () => { sync(); if (document.hidden && context) context.suspend().catch(() => {}); };
    const hide = () => { if (context) context.suspend().catch(() => {}); };
    if (!Audio) { enabled = false; button.disabled = true; button.title = '此浏览器暂不支持音效'; }
    buttonState();
    button.addEventListener('click', toggle);
    document.addEventListener('pointerdown', gesture, {passive:true}); document.addEventListener('keydown', gesture);
    document.addEventListener('toggle', visibility, true); document.addEventListener('visibilitychange', visibility);
    root.addEventListener('pagehide', hide); root.addEventListener('pageshow', visibility);
    return {sync, destroy() {
      disposed = true; source?.stop(); if (context) context.close().catch(() => {});
      button.removeEventListener('click', toggle); document.removeEventListener('pointerdown', gesture);
      document.removeEventListener('keydown', gesture); document.removeEventListener('toggle', visibility, true);
      document.removeEventListener('visibilitychange', visibility); root.removeEventListener('pagehide', hide);
      root.removeEventListener('pageshow', visibility);
    }};
  }
  root.KilnSound = {samples, level, mount};
  if (typeof module !== 'undefined') module.exports = root.KilnSound;
})(typeof window !== 'undefined' ? window : globalThis);
