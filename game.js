(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  let W, H;
  function resize() {
    W = Math.floor(window.innerWidth * dpr);
    H = Math.floor(window.innerHeight * dpr);
    canvas.width = W; canvas.height = H;
  }
  resize();
  window.addEventListener('resize', resize);

  // UI
  const el = (id)=>document.getElementById(id);
  const ui = {
    start: el('startScreen'),
    over: el('gameOver'),
    score: el('score'),
    wave: el('wave'),
    awake: el('awake'),
    high: el('highScore'),
    final: el('finalScore'),
    hint: el('hint'),
    btnStart: el('btnStart'),
    btnHow: el('btnHow'),
    btnPause: el('btnPause'),
    btnRetry: el('btnRetry'),
    btnShare: el('btnShare'),
    btnSound: el('btnSound'),
    sPop: document.getElementById('sPop')
  };
  ui.high.textContent = localStorage.getItem('cbc_high') || 0;

  let playing = false, paused = false, soundOn = true;
  ui.btnSound.addEventListener('click', ()=>{
    soundOn = !soundOn;
    ui.btnSound.textContent = soundOn ? '🔊' : '🔈';
  });
  function showStart() { ui.start.classList.add('show'); ui.over.classList.remove('show'); playing=false; paused=false; }
  function hideStart() { ui.start.classList.remove('show'); }
  function showOver() { ui.over.classList.add('show'); playing=false; }
  function hideOver() { ui.over.classList.remove('show'); }
  ui.btnStart.addEventListener('click', () => { startGame(); });
  ui.btnHow.addEventListener('click', () => {
    alert('Drag to aim and release to toss a soothing pillow. Calm kids so they yawn and walk to bed. Keep the chaos under control to score!');
  });
  ui.btnRetry.addEventListener('click', () => { startGame(); });
  ui.btnShare.addEventListener('click', async () => {
    const text = `I scored ${state.score} in Chris’s Bedtime Chaos!`;
    if (navigator.share) { navigator.share({ text }).catch(()=>{}); }
    else { navigator.clipboard.writeText(text).then(()=>alert('Copied to clipboard!')); }
  });
  ui.btnPause.addEventListener('click', ()=>{ paused = !paused; ui.btnPause.textContent = paused ? '▶️' : '⏸'; });

  // Game state
  const state = {
    score: 0,
    wave: 1,
    kids: [],
    pillows: [],
    awakeCount: 0,
    spawnTimer: 0,
    nextWaveAt: 20,
    missed: 0,
    beds: []
  };

  const rng = (min, max) => Math.random() * (max - min) + min;
  const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));

  // Simple shapes
  function drawGirl(x, y, s=1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // body
    ctx.fillStyle = '#ffb3c1'; // skin
    // head
    ctx.beginPath(); ctx.arc(0, -22, 12, 0, Math.PI*2); ctx.fill();
    // hair (red)
    ctx.fillStyle = '#e0492e';
    ctx.beginPath(); ctx.arc(0, -24, 14, Math.PI*0.1, Math.PI*0.9); ctx.fill();
    ctx.fillRect(-14,-24,28,10);
    // glasses
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
    ctx.strokeRect(-10,-26,9,7); ctx.strokeRect(1,-26,9,7);
    ctx.beginPath(); ctx.moveTo(-1,-22.5); ctx.lineTo(1,-22.5); ctx.stroke();
    // torso
    ctx.fillStyle = '#7f5af0'; ctx.fillRect(-6,-12,12,18);
    // arms
    ctx.fillStyle = '#ffb3c1'; ctx.fillRect(-12,-10,6,10); ctx.fillRect(6,-10,6,10);
    // legs
    ctx.fillStyle = '#222'; ctx.fillRect(-6,6,5,10); ctx.fillRect(1,6,5,10);
    ctx.restore();
  }

  function drawKid(k) {
    const {x,y,dir,calm} = k;
    ctx.save(); ctx.translate(x,y);
    // body
    ctx.fillStyle = calm ? '#7cc6fe' : '#ffd166';
    ctx.fillRect(-7,-14,14,20);
    // head
    ctx.fillStyle = '#ffe0b2';
    ctx.beginPath(); ctx.arc(0,-18,7,0,Math.PI*2); ctx.fill();
    // eyes
    ctx.fillStyle = '#111';
    if (calm) {
      ctx.fillRect(-3,-19,2,2);
      ctx.fillRect(1,-19,2,2);
      // small Z
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '10px monospace';
      ctx.fillText('Z', 8, -22);
    } else {
      ctx.fillRect(-4,-20,2,3);
      ctx.fillRect(2,-20,2,3);
    }
    // feet
    ctx.fillStyle = '#222'; ctx.fillRect(-7,6,6,4); ctx.fillRect(1,6,6,4);
    ctx.restore();
  }

  function drawBed(b) {
    const {x,y,w,h} = b;
    ctx.save();
    ctx.fillStyle = '#223';
    ctx.fillRect(x,y,w,h);
    ctx.fillStyle = '#5eead4';
    ctx.fillRect(x+4,y+4,w-8,h-12);
    ctx.fillStyle = '#a7f3d0';
    ctx.fillRect(x+4, y+h-12, w-8, 8);
    ctx.restore();
  }

  
  function drawPillow(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.sin(performance.now()/300 + b.x*0.01) * 0.05);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(200,200,200,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-b.r*1.2, -b.r*0.8, b.r*2.4, b.r*1.6, b.r*0.4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }


  // Touch / pointer input
  let pointer = { active:false, sx:0, sy:0, x:0, y:0 };
  canvas.addEventListener('pointerdown', e => {
    pointer.active = true;
    pointer.sx = e.clientX * dpr; pointer.sy = e.clientY * dpr;
    pointer.x = pointer.sx; pointer.y = pointer.sy;
    ui.hint.style.display = 'none';
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointer.active) return;
    pointer.x = e.clientX * dpr; pointer.y = e.clientY * dpr;
  });
  window.addEventListener('pointerup', e => {
    if (!pointer.active) return;
    pointer.active = false;
    // flick vector
    const dx = (pointer.sx - pointer.x);
    const dy = (pointer.sy - pointer.y);
    const mag = Math.hypot(dx, dy);
    const maxV = 18 * dpr;
    const vx = clamp(dx*0.25, -maxV, maxV);
    const vy = clamp(dy*0.25, -maxV, maxV);
    throwPillow(player.x, player.y-28, vx, vy);
  }, {passive:true});

  // Player
  const player = { x: 80*dpr, y: H - 80*dpr, aimX: 0, aimY: 0 };

  // Beds (targets kids walk to when calm)
  function layoutBeds() {
    state.beds = [];
    const rows = 1 + Math.min(3, Math.floor(state.wave/3));
    const w = 90*dpr, h = 40*dpr;
    for (let r=0;r<rows;r++) {
      const y = 40*dpr + r*(h+20*dpr);
      state.beds.push({ x: W - (w + 20*dpr), y, w, h });
    }
  }

  function spawnKid() {
    const y = rng(80*dpr, H-100*dpr);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x = dir === 1 ? -20*dpr : W+20*dpr;
    state.kids.push({
      x, y, dir, speed: rng(0.8, 1.6)*dpr*(1+state.wave*0.05),
      calm:false, vx:0, vy:0, r: 10*dpr, toBed: null
    });
  }

  function throwPillow(x, y, vx, vy) {
    const b = { x, y, vx, vy, r: 14*dpr, life: 3.5 };
    state.pillows.push(b);
    if (soundOn) { try { ui.sPop.currentTime = 0; ui.sPop.play().catch(()=>{}); } catch(_){} }
  }

  function distance(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }

  function update(dt) {
    // spawn logic
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnKid();
      state.spawnTimer = Math.max(0.4, 1.4 - state.wave*0.06);
    }

    // kids
    state.awakeCount = 0;
    for (const k of state.kids) {
      if (!k.calm) {
        state.awakeCount++;
        k.x += k.dir*k.speed*dt*60;
        if (k.x < -40*dpr || k.x > W+40*dpr) {
          // wrap around
          k.dir *= -1;
          k.x = clamp(k.x, -40*dpr, W+40*dpr);
        }
      } else {
        // walk to nearest bed
        if (!k.toBed) {
          k.toBed = state.beds.reduce((p,b) => (Math.abs((b.y+b.h/2)-k.y) < Math.abs((p.y+p.h/2)-k.y)? b : p), state.beds[0]);
        }
        const bx = k.toBed.x + 10*dpr;
        const by = k.toBed.y + k.toBed.h/2;
        const ax = bx - k.x, ay = by - k.y, len = Math.hypot(ax,ay) || 1;
        k.x += (ax/len) * k.speed * dt * 40;
        k.y += (ay/len) * k.speed * dt * 40;
        // reached bed
        if (Math.abs(k.x - bx) < 8*dpr && Math.abs(k.y - by) < 10*dpr) {
          // tucked in: remove and +score
          state.score += 5;
          k.remove = true;
        }
      }
    }
    state.kids = state.kids.filter(k=>!k.remove);

    // bubbles
    for (const b of state.pillows) {
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.2*dpr; // gentle gravity
      b.life -= dt;
      // collide with kids
      for (const k of state.kids) {
        if (!k.calm && distance(b,k) < b.r + k.r) {
          k.calm = true;
          state.score += 1;
          b.life = 0;
          break;
        }
      }
      // bounds
      if (b.x < 0 || b.x > W || b.y > H) b.life = 0;
    }
    state.pillows = state.pillows.filter(b=>b.life > 0);

    // wave progression
    if (state.score >= state.nextWaveAt) {
      state.wave++;
      ui.wave.textContent = state.wave;
      state.nextWaveAt += 20 + state.wave*5;
      layoutBeds();
    }

    ui.score.textContent = state.score;
    ui.awake.textContent = state.awakeCount;
  }

  function render() {
    ctx.clearRect(0,0,W,H);
    // bg
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0b1020'); g.addColorStop(1,'#11162a');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    // moon
    ctx.beginPath(); ctx.arc(W-60*dpr, 60*dpr, 28*dpr, 0, Math.PI*2); ctx.fillStyle='#fef3c7'; ctx.fill();
    ctx.beginPath(); ctx.arc(W-48*dpr, 56*dpr, 25*dpr, 0, Math.PI*2); ctx.fillStyle='#0b1020'; ctx.fill();

    // beds
    for (const b of state.beds) drawBed(b);

    // player
    drawGirl(player.x, player.y, 1.1);

    // aim line (drag)
    if (pointer.active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pointer.sx, pointer.sy); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
    }

    // bubbles
    for (const b of state.pillows) drawPillow(b);
    // kids
    for (const k of state.kids) drawKid(k);
  }

  let last = performance.now();
  function loop(now) {
    if (!playing) return;
    requestAnimationFrame(loop);
    const dt = clamp((now - last)/1000, 0, 0.05);
    last = now;
    if (!paused) {
      update(dt);
      render();
    }
  }

  function startGame() {
    hideStart(); hideOver();
    state.score = 0; state.wave = 1; state.kids = []; state.pillows=[];
    state.spawnTimer = 0; state.nextWaveAt = 20; state.missed = 0;
    layoutBeds();
    ui.score.textContent = '0'; ui.wave.textContent = '1'; ui.awake.textContent = '0';
    playing = true; paused = false; last = performance.now();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    playing = false;
    const hs = Math.max(Number(localStorage.getItem('cbc_high')||0), state.score);
    localStorage.setItem('cbc_high', hs);
    ui.high.textContent = hs;
    ui.final.textContent = state.score;
    showOver();
  }

  // Fail condition: too many awake kids for too long
  let overTimer = 0;
  setInterval(()=>{
    if (!playing || paused) return;
    if (state.awakeCount > 6 + Math.floor(state.wave/2)) overTimer++;
    else overTimer = Math.max(0, overTimer-1);
    if (overTimer > 6) { gameOver(); overTimer = 0; }
  }, 500);

  // iOS audio unlock
  window.addEventListener('touchstart', ()=>{
    ui.sPop.play().then(()=>ui.sPop.pause()).catch(()=>{});
  }, {once:true, passive:true});

  // Start screen visible initially
})();