(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const overlay = document.getElementById('overlay');
  const btnStart = document.getElementById('btnStart');
  const title = document.getElementById('title');
  const subtitle = document.getElementById('subtitle');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');

  let W = 0, H = 0, DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const fit = () => {
    W = Math.round(window.innerWidth * DPR);
    H = Math.round(window.innerHeight * DPR);
    canvas.width = W; canvas.height = H;
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
  };
  fit(); window.addEventListener('resize', fit);

  // --- Game State ---
  const G = {
    running: false,
    score: 0,
    best: +(localStorage.getItem('flappy_best') || 0),
    t: 0
  };
  bestEl.textContent = G.best;

  // Player (cube)
  const P = {
    x: 0, y: 0, vx: 0, vy: 0,
    size: 26,
    gravity: 1700,     // px/s^2
    jumpV: -520,       // px/s
    maxFall: 900
  };

  // Pipes
  let pipes = [];
  const PIPE = {
    w: 70,
    gap: 170,
    speed: 220,
    spawnEvery: 1300, // ms
    lastSpawn: 0
  };

  // Simple PRNG for consistent feel
  const rnd = (a,b) => a + Math.random()*(b-a);

  function reset() {
    G.running = false;
    G.score = 0;
    scoreEl.textContent = 0;
    P.x = Math.round(W * 0.28);
    P.y = Math.round(H * 0.45);
    P.vx = 0; P.vy = 0;
    pipes = [];
    PIPE.lastSpawn = 0;
    G.t = 0;
    overlay.classList.remove('hidden');
    title.textContent = 'Flappy Cube';
    subtitle.textContent = 'Touchez l’écran pour sauter';
  }

  function start() {
    overlay.classList.add('hidden');
    G.running = true;
    G.t = 0;
    P.vy = 0;
  }

  function jump() {
    if (!G.running) { start(); return; }
    P.vy = P.jumpV;
  }

  // Input
  function onPointer() { jump(); }
  canvas.addEventListener('pointerdown', onPointer, { passive: true });
  btnStart.addEventListener('click', start);

  // Physics & logic
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.035, Math.max(0.001, (now - last) / 1000));
    last = now;
    G.t += dt * 1000;

    // bg
    ctx.fillStyle = '#0f1220';
    ctx.fillRect(0,0,W,H);

    // Decorative stars
    drawStars(now);

    if (G.running) {
      // Spawn pipes
      if (G.t - PIPE.lastSpawn > PIPE.spawnEvery) {
        PIPE.lastSpawn = G.t;
        const minGapY = 120 * DPR;
        const maxGapY = H - 120 * DPR;
        const gapY = Math.max(minGapY, Math.min(maxGapY, rnd(H*0.3, H*0.7)));
        const x = W + PIPE.w + 10;
        pipes.push({ x, y: gapY - PIPE.gap/2, passed:false });
      }

      // Update pipes
      for (let i=0; i<pipes.length; i++) {
        pipes[i].x -= PIPE.speed * dt * DPR;
      }
      // Remove off-screen
      pipes = pipes.filter(p => p.x + PIPE.w > -40);

      // Update player
      P.vy += P.gravity * dt * DPR;
      if (P.vy > P.maxFall * DPR) P.vy = P.maxFall * DPR;
      P.y += P.vy * dt;

      // Collisions with ground/ceiling
      const half = P.size * DPR / 2;
      if (P.y - half < 0) { P.y = half; P.vy = 0; }
      if (P.y + half > H) { gameOver(); }

      // Collisions with pipes + scoring
      for (const p of pipes) {
        // top rect: from y=0 to p.y
        const topRect = { x: p.x, y: 0, w: PIPE.w, h: p.y };
        // bottom rect: from y=p.y+gap to H
        const bottomRect = { x: p.x, y: p.y + PIPE.gap, w: PIPE.w, h: H - (p.y + PIPE.gap) };

        if (rectIntersectsCircle(topRect, P.x, P.y, half) ||
            rectIntersectsCircle(bottomRect, P.x, P.y, half)) {
          gameOver();
        }

        // score when cube passes pipe center
        if (!p.passed && p.x + PIPE.w < P.x - half) {
          p.passed = true;
          G.score++;
          scoreEl.textContent = G.score;
          // Slightly increase difficulty
          if (G.score % 5 === 0) {
            PIPE.speed += 8;
            if (PIPE.gap > 120) PIPE.gap -= 6;
            if (PIPE.spawnEvery > 900) PIPE.spawnEvery -= 20;
          }
        }
      }
    }

    // Draw pipes
    drawPipes();

    // Draw player
    drawCube();

    requestAnimationFrame(tick);
  }

  function gameOver() {
    G.running = false;
    if (G.score > G.best) {
      G.best = G.score;
      localStorage.setItem('flappy_best', String(G.best));
      bestEl.textContent = G.best;
    }
    overlay.classList.remove('hidden');
    title.textContent = 'Perdu 😅';
    subtitle.textContent = `Score: ${G.score} — Touchez pour rejouer`;
  }

  function drawPipes() {
    for (const p of pipes) {
      const x = Math.round(p.x);
      // pipe style
      ctx.fillStyle = '#19c37d';
      // top
      ctx.fillRect(x, 0, PIPE.w, p.y);
      // bottom
      ctx.fillRect(x, p.y + PIPE.gap, PIPE.w, H - (p.y + PIPE.gap));
      // edges
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.fillRect(x, p.y - 6, PIPE.w, 6);
      ctx.fillRect(x, p.y + PIPE.gap, PIPE.w, 6);
    }
  }

  function drawCube() {
    const half = P.size * DPR / 2;
    const x = Math.round(P.x - half), y = Math.round(P.y - half), s = Math.round(P.size * DPR);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(x + 3*DPR, y + 3*DPR, s, s);

    // body
    ctx.fillStyle = '#6c5ce7';
    ctx.fillRect(x, y, s, s);

    // face
    ctx.fillStyle = '#fff';
    const eye = Math.max(2*DPR, Math.floor(s*0.1));
    ctx.fillRect(x + Math.floor(s*0.2), y + Math.floor(s*0.3), eye, eye);
    ctx.fillRect(x + Math.floor(s*0.6), y + Math.floor(s*0.3), eye, eye);
    ctx.fillRect(x + Math.floor(s*0.3), y + Math.floor(s*0.65), Math.floor(s*0.4), Math.max(2*DPR, Math.floor(s*0.08)));
  }

  function drawStars(now) {
    // parallax stars (no allocation)
    const t = now * 0.02;
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#1b2140';
    for (let i=0; i<50; i++) {
      const x = ( (i*97 + t) % W );
      const y = ( (i*53 + t*0.6) % H );
      ctx.fillRect(x, y, 2*DPR, 2*DPR);
    }
    ctx.globalAlpha = 1;
  }

  function rectIntersectsCircle(r, cx, cy, cr) {
    // clamp closest point in rect to circle center
    const closestX = Math.max(r.x, Math.min(cx, r.x + r.w));
    const closestY = Math.max(r.y, Math.min(cy, r.y + r.h));
    const dx = cx - closestX, dy = cy - closestY;
    return dx*dx + dy*dy < cr*cr;
  }

  // Start
  reset();
  requestAnimationFrame((t)=>{ last=t; requestAnimationFrame(tick); });

  // Allow overlay tap to start
  overlay.addEventListener('click', () => {
    if (!G.running) start();
  });

  // Pause when tab hidden (safety)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.running) gameOver();
    }
  });
})();
