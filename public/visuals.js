/* Actual ShaderGradient + Liquid Glass islands. Game state, focus and controls stay native. */
(() => {
  'use strict';
  const html = document.documentElement;
  const shaderURL = '/vendor/shader-island.js?v=shadergradient-2.4.20';
  const liquidRoot = '/vendor/liquid-glass/';
  const instances = new Map(), scripts = new Map();
  let shaderModule, shaderPromise, glassPromise, glassClass, stage, mountedSignature = '', refreshFrame = 0;
  let mountedStage = null;
  let shaderState = 'static', glassSnapshot = null, refreshVersion = 0, poster;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let webglSupport;
  const role = () => document.body?.dataset.view || (location.pathname.includes('host') ? 'host' : 'join');
  const preferences = () => window.BuzzerUX?.getPreferences?.() || {};
  const visible = element => !!(element?.isConnected && element.getClientRects().length && !element.closest('[hidden]') && (!(element instanceof HTMLDialogElement) || element.open));
  function available() {
    if (webglSupport !== undefined) return webglSupport;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { powerPreference: 'low-power' }) || canvas.getContext('webgl');
      webglSupport = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { webglSupport = false; }
    html.dataset.visualWebgl = webglSupport ? 'on' : 'off';
    return webglSupport;
  }
  function mayDecorate() {
    const p = preferences();
    return !document.hidden && !p.highContrast && !p.focusMode && !p.reduceTransparency && html.dataset.uxContrast !== 'true' && html.dataset.uxFocus !== 'true' && html.dataset.uxTransparency !== 'reduce';
  }
  function mayAnimate() {
    const p = preferences();
    return mayDecorate() && p.backgrounds !== 'off' && p.motion !== 'reduce' && html.dataset.uxMotion !== 'reduce' && !motion.matches;
  }
  function getStage() {
    let target = [...document.querySelectorAll('[data-shader-stage]')].find(visible);
    if (!target) {
      target = document.getElementById('buzzer-shader-stage');
      if (!target) { target = document.createElement('div'); target.id = 'buzzer-shader-stage'; target.className = 'buzzer-shader-stage'; document.body.prepend(target); }
    }
    target.classList.add('buzzer-shader-stage');
    target.setAttribute('aria-hidden', 'true');
    target.setAttribute('data-html2canvas-ignore', 'true');
    target.dataset.visualRole = role();
    if (!target.dataset.visualContextListener) {
      target.dataset.visualContextListener = 'true';
      target.addEventListener('webglcontextlost', () => {
        if (mountedStage === target) { ++refreshVersion; failShader(); clearGlass(); }
      }, true);
    }
    return target;
  }
  function loadScript(src) {
    if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src; script.async = false;
      script.onload = resolve; script.onerror = () => reject(new Error('Optional visual asset unavailable'));
      document.head.append(script);
    }));
    return scripts.get(src);
  }
  function stopShader() {
    if (mountedStage) shaderModule?.unmount(mountedStage);
    mountedStage = null;
    mountedSignature = ''; shaderState = 'static'; html.dataset.visualShader = shaderState;
  }
  function failShader() { stopShader(); shaderState = 'fallback'; html.dataset.visualShader = shaderState; }
  function syncVideo() {
    const video = document.getElementById('menu-video');
    if (!video) return;
    const shouldPlay = role() === 'menu' && mayAnimate();
    if (role() === 'menu' && mayDecorate() && !poster) {
      poster = new Image(); poster.src = '/assets/menu-loop-poster.jpg';
      poster.onload = () => { if (instances.size) refresh(); };
    }
    video.muted = true; video.loop = true; video.playsInline = true;
    if (shouldPlay) {
      if (!video.getAttribute('src') && video.dataset.src) { video.src = video.dataset.src; video.load(); }
      const result = video.play();
      result?.catch(() => { video.dataset.visualPlayback = 'poster'; });
      video.dataset.visualPlayback = 'playing';
    } else { video.pause(); video.dataset.visualPlayback = 'poster'; }
  }
  function drawCover(ctx, image, width, height, opacity = 1) {
    const iw = image.videoWidth || image.naturalWidth || image.width, ih = image.videoHeight || image.naturalHeight || image.height;
    if (!iw || !ih) return;
    const scale = Math.max(width / iw, height / ih);
    ctx.save(); ctx.globalAlpha = opacity;
    ctx.drawImage(image, (width - iw * scale) / 2, (height - ih * scale) / 2, iw * scale, ih * scale); ctx.restore();
  }
  // Sample decorative pixels only. No form fields, private messages, names or room keys are captured.
  function snapshotBackdrop() {
    const canvas = document.createElement('canvas'); canvas.width = Math.min(innerWidth, 1920); canvas.height = Math.min(innerHeight, 1200);
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    const dark = html.dataset.uxTheme !== 'light' || role() === 'menu';
    ctx.fillStyle = dark ? '#141914' : '#edf1e5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shaderCanvas = stage?.querySelector('canvas');
    try { if (shaderCanvas) drawCover(ctx, shaderCanvas, canvas.width, canvas.height, .65); } catch {}
    const video = document.getElementById('menu-video');
    if (role() === 'menu') {
      try { if (video?.readyState >= 2) drawCover(ctx, video, canvas.width, canvas.height, .35); else if (poster?.complete) drawCover(ctx, poster, canvas.width, canvas.height, .35); } catch {}
    }
    return canvas;
  }
  function releaseGlass(target, instance) {
    instance.disposed = true; instance.element?.remove();
    const gl = instance.gl_refs?.gl || instance.gl;
    if (gl) { try { gl.deleteTexture(instance.gl_refs.texture); gl.deleteBuffer(instance.gl_refs.positionBuffer); gl.deleteBuffer(instance.gl_refs.texcoordBuffer); gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} }
    resizeObserver?.unobserve(target);
    instances.delete(target); delete target.dataset.liquidGlass; delete target.dataset.visualPosition;
    const lib = window.BuzzerLiquidGlass;
    if (lib) lib.Container.instances = lib.Container.instances.filter(i => i !== instance);
  }
  function clearGlass() { for (const [target, instance] of instances) releaseGlass(target, instance); }
  function renderGlass() { if (!document.hidden) for (const instance of instances.values()) instance.render?.(); }
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    for (const entry of entries) { const instance = instances.get(entry.target); if (instance && !document.hidden) { instance.updateSizeFromDOM(); requestAnimationFrame(() => instance.render?.()); } }
  }) : null;
  async function getGlassClass() {
    if (glassClass) return glassClass;
    if (!glassPromise) glassPromise = (async () => {
      await loadScript(liquidRoot + 'container.js?v=78cb6ccb');
      await loadScript(liquidRoot + 'button.js?v=78cb6ccb');
      await loadScript(liquidRoot + 'bridge.js?v=1');
      const { Container } = window.BuzzerLiquidGlass;
      // Extend upstream lifecycle only; the real WebGL refraction/masking shader is unchanged.
      glassClass = class BuzzerGlass extends Container {
        constructor(target) {
          BuzzerGlass.target = target;
          super({ borderRadius: Math.min(24, parseFloat(getComputedStyle(target).borderRadius) || 16), type: 'rounded', tintOpacity: .14 });
          this.target = target; BuzzerGlass.target = null;
        }
        createElement() {
          super.createElement();
          this.element.classList.add('buzzer-glass-layer'); this.element.setAttribute('aria-hidden', 'true');
          this.canvas.style.boxShadow = 'none'; this.canvas.style.zIndex = '0';
          BuzzerGlass.target.append(this.element);
        }
        initWebGL() { if (!this.disposed) super.initWebGL(); }
        setupShader(image) { if (!this.disposed) super.setupShader(image); }
        // Upstream uses one event-driven draw, not an animation loop. Keep our own removable lifecycle.
        startRenderLoop() {
          this.render = () => {
            const gl = this.gl_refs?.gl;
            if (!gl || this.disposed || document.hidden) return;
            gl.clear(gl.COLOR_BUFFER_BIT);
            const position = this.getPosition();
            gl.uniform1f(this.gl_refs.scrollYLoc, 0);
            const texture = window.BuzzerLiquidGlass.Container.pageSnapshot;
            // The library samples in CSS pixels; convert to the capped backdrop snapshot dimensions.
            gl.uniform2f(this.gl_refs.containerPositionLoc, position.x * texture.width / innerWidth, position.y * texture.height / innerHeight);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          };
          this.render();
        }
      };
      return glassClass;
    })();
    return glassPromise;
  }
  async function syncGlass(version) {
    const targets = [...document.querySelectorAll('[data-glass], .buzzer-glass, .ux-settings-trigger, .buzzer-profile-trigger')].filter(visible).slice(0, 6);
    for (const [target, instance] of instances) if (!targets.includes(target)) releaseGlass(target, instance);
    if (!targets.length || !mayDecorate() || !available()) { clearGlass(); return; }
    try {
      const Glass = await getGlassClass();
      if (version !== refreshVersion || !mayDecorate()) return;
      glassSnapshot = snapshotBackdrop(); if (!glassSnapshot) return;
      const Container = window.BuzzerLiquidGlass.Container;
      Container.pageSnapshot = glassSnapshot;
      // Existing instances keep their buffers: refresh only the backdrop texture.
      for (const instance of instances.values()) {
        if (instance.gl_refs?.texture && instance.gl_refs.gl) {
          const gl = instance.gl_refs.gl;
          gl.bindTexture(gl.TEXTURE_2D, instance.gl_refs.texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glassSnapshot);
          gl.uniform2f(instance.gl_refs.textureSizeLoc, glassSnapshot.width, glassSnapshot.height);
        }
      }
      for (const target of targets) if (!instances.has(target) && visible(target)) {
        if (getComputedStyle(target).position === 'static') target.dataset.visualPosition = 'relative';
        const instance = new Glass(target);
        target.dataset.liquidGlass = 'active'; instances.set(target, instance); resizeObserver?.observe(target);
      }
      requestAnimationFrame(renderGlass);
    } catch { clearGlass(); html.dataset.visualGlass = 'fallback'; }
  }
  async function update() {
    const version = ++refreshVersion;
    if (!document.body) return;
    stage = getStage();
    stage.dataset.visualRole = role();
    syncVideo();
    const p = preferences();
    const decorates = mayDecorate();
    stage.hidden = !decorates || p.backgrounds === 'off';
    if (!mayAnimate() || !available() || !['menu', 'join', 'player', 'host', 'host-setup'].includes(role())) {
      stopShader();
      if (!decorates || !available()) clearGlass(); else await syncGlass(version);
      return;
    }
    const nextSignature = `${role()}:${p.backgrounds || 'light'}`;
    if (mountedSignature !== nextSignature || mountedStage !== stage) {
      try {
        shaderState = 'loading'; html.dataset.visualShader = shaderState;
        if (!shaderPromise) shaderPromise = import(shaderURL);
        shaderModule = await shaderPromise;
        if (version !== refreshVersion || !mayAnimate()) return;
        stopShader();
        mountedSignature = nextSignature; mountedStage = stage;
        shaderModule.mount(stage, { role: role(), intensity: p.backgrounds || 'light', onFailure: failShader });
        shaderState = 'ready'; html.dataset.visualShader = shaderState;
        // Capture once after the first render; ordinary view/pref changes refresh the texture later.
        setTimeout(() => { if (version === refreshVersion && mayDecorate()) syncGlass(version); }, 350);
      } catch { shaderPromise = null; failShader(); }
    }
    await syncGlass(version);
  }
  function refresh() {
    if (refreshFrame) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; update(); });
  }
  window.BuzzerVisuals = {
    refresh,
    status: () => ({ shader: shaderState, glass: instances.size, role: role(), video: document.getElementById('menu-video')?.dataset.visualPlayback || 'absent', webgl: webglSupport })
  };
  document.addEventListener('buzzer:preferences', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ++refreshVersion; stopShader(); clearGlass(); const video = document.getElementById('menu-video'); if (video) { video.pause(); video.dataset.visualPlayback = 'poster'; } }
    else refresh();
  });
  addEventListener('resize', refresh, { passive: true });
  addEventListener('scroll', () => { if (instances.size && !document.hidden) requestAnimationFrame(renderGlass); }, { passive: true });
  motion.addEventListener?.('change', refresh);
  document.addEventListener('close', refresh, true);
  function start() { refresh(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
