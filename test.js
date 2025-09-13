/* =========================
   Royal Match Engine++ (lite, no assets)
   — swipe + specials + cascades + anti-deadlock
   ========================= */
(() => {
  const ROWS=8, COLS=8, COLORS=['red','blue','green','purple','yellow','orange'];
  const TARGET=5000;
  const $ = sel => document.querySelector(sel);
  const boardEl = $('#board'), toastEl = $('#toast');
  const ui = {
    score: $('#score'), moves: $('#moves'), time: $('#time'), bar: $('#bar'), goal: $('#goalTxt'),
    coins: $('#coins'), hearts: $('#hearts'), gems: $('#gems'),
    counts: { bomb: $('#cBomb'), rainbow: $('#cRainbow'), sw: $('#cSwitch'), time: $('#cTime') },
    boosters: { bomb: $('#bBomb'), rainbow: $('#bRainbow'), sw: $('#bSwitch'), time: $('#bTime') }
  };

  const SND = {
    enabled: false,
    pop: new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAABkAAAAAAA='),
    boom: new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAABkAAAAAAA=')
  };

  let g = {
    level: 1, total: 15,
    score: 0, moves: 20, time: 120,
    goalColor: 'blue', goalLeft: 20,
    activeBooster: null,
    inv: { bomb:3, rainbow:2, sw:5, time:2 },
    grid: [], // {color, type:'norm|stripH|stripV|wrapped|rainbow', el}
    sel: null, busy: false, timer: null
  };

  // UI helpers
  const toast = (t) => { toastEl.textContent=t; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),1200); };
  const updBar = ()=> g.uiBar = ui.bar.style.width = Math.min(100, g.score/TARGET*100)+'%';
  const updCounts = ()=>{
    ui.counts.bomb.textContent='x'+g.inv.bomb;
    ui.counts.rainbow.textContent='x'+g.inv.rainbow;
    ui.counts.sw.textContent='x'+g.inv.sw;
    ui.counts.time.textContent='x'+g.inv.time;
  };
  const updHUD = ()=>{
    ui.score.textContent=g.score;
    ui.moves.textContent=g.moves;
    ui.time.textContent=g.time;
    ui.goal.textContent = `${TARGET.toLocaleString()} pts + ${g.goalLeft} ${g.goalColor}s`;
    updBar(); updCounts();
  };

  // Grid
  const newCell = (color,type='norm')=>({color,type,el:null});
  const makeGrid = ()=> Array.from({length:ROWS},()=>Array.from({length:COLS},()=>newCell(randColor())));
  const randColor = ()=> COLORS[Math.floor(Math.random()*COLORS.length)];

  const render = ()=>{
    boardEl.innerHTML='';
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const t=g.grid[r][c]; const d=document.createElement('div');
        d.className = `tile ${t.color} ${mapTypeClass(t.type)}`;
        d.dataset.r=r; d.dataset.c=c;
        const shp=document.createElement('div'); shp.className='shape'; d.appendChild(shp);
        bindTileEvents(d);
        boardEl.appendChild(d); t.el=d;
      }
    }
  };
  const mapTypeClass = (type)=> type==='stripH'?'stripH':type==='stripV'?'stripV':type==='wrapped'?'wrapped':type==='rainbow'?'rainbow':'';

  // Input (click & swipe)
  let dragStart=null;
  const bindTileEvents = (el)=>{
    el.addEventListener('mousedown',startDrag);
    el.addEventListener('touchstart',startDrag,{passive:true});
    el.addEventListener('mouseup',endDrag);
    el.addEventListener('touchend',endDrag);
    el.addEventListener('click',onClickTile);
  };
  function startDrag(e){
    if(g.busy) return;
    const t=e.currentTarget; dragStart = { r:+t.dataset.r, c:+t.dataset.c, x:posX(e), y:posY(e) };
    select(dragStart.r,dragStart.c);
  }
  function endDrag(e){
    if(!dragStart){ clearSel(); return; }
    const dx = posX(e)-dragStart.x, dy=posY(e)-dragStart.y;
    const absx=Math.abs(dx), absy=Math.abs(dy);
    let r2=dragStart.r, c2=dragStart.c;
    if(Math.max(absx,absy) > 24){
      if(absx>absy) c2 += dx>0?1:-1; else r2 += dy>0?1:-1;
      trySwap(dragStart.r,dragStart.c,r2,c2);
    } else {
      // tap-only handled by click
    }
    dragStart=null;
  }
  const posX = (e)=> (e.touches? e.touches[0].clientX : e.clientX);
  const posY = (e)=> (e.touches? e.touches[0].clientY : e.clientY);

  function onClickTile(e){
    if(g.busy) return;
    const r=+e.currentTarget.dataset.r, c=+e.currentTarget.dataset.c;

    // Boosters
    if(g.activeBooster==='bomb'){ if(g.inv.bomb<=0) return toast('Plus de bombes');
      g.inv.bomb--; blast3x3(r,c); g.activeBooster=null; setBoosterUI(); return; }
    if(g.activeBooster==='rainbow'){ if(g.inv.rainbow<=0) return toast('Plus d’arc-en-ciel');
      g.inv.rainbow--; clearColor(g.grid[r][c].color); g.activeBooster=null; setBoosterUI(); return; }

    // Rainbow swap: if one selected rainbow → turn other color
    if(g.sel){
      const a=g.sel, b={r,c};
      if(a.r===r && a.c===c){ clearSel(); return; }
      if(!adj(a,b)){ select(r,c); return; }
      trySwap(a.r,a.c,r,c);
    } else {
      select(r,c);
    }
  }

  const select = (r,c)=>{
    clearSel(); g.sel={r,c}; g.grid[r][c].el.classList.add('sel');
  };
  const clearSel = ()=>{
    if(!g.sel) return;
    g.grid[g.sel.r][g.sel.c].el.classList.remove('sel'); g.sel=null;
  };
  const adj = (a,b)=> Math.abs(a.r-b.r)+Math.abs(a.c-b.c)===1;

  // Swap & resolve
  function trySwap(r1,c1,r2,c2){
    if(r2<0||r2>=ROWS||c2<0||c2>=COLS){ clearSel(); return; }
    g.busy=true;
    swap(r1,c1,r2,c2);
    render();
    // Special rainbow behaviour
    const A=g.grid[r1][c1], B=g.grid[r2][c2];
    let forcedGroups=null;
    if(A.type==='rainbow' && B.type!=='rainbow'){ forcedGroups=[forceClearColor(B.color)]; }
    else if(B.type==='rainbow' && A.type!=='rainbow'){ forcedGroups=[forceClearColor(A.color)]; }

    const groups = forcedGroups || findMatches();
    if(groups.length===0){
      // revert if no match and not free switch
      if(g.activeBooster==='sw' && g.inv.sw>0){ g.inv.sw--; g.activeBooster=null; setBoosterUI(); toast('Échange gratuit.'); g.moves--; afterResolve([]); return; }
      swap(r1,c1,r2,c2); render(); toast('Raté.'); clearSel(); g.busy=false; return;
    }
    if(SND.enabled) SND.pop.play();
    g.moves--;
    resolve(groups,1);
  }

  const swap=(r1,c1,r2,c2)=>{ [g.grid[r1][c1], g.grid[r2][c2]] = [g.grid[r2][c2], g.grid[r1][c1]]; };

  // Matching
  function findMatches(){
    const groups=[];
    // rows
    for(let r=0;r<ROWS;r++){
      let run=1;
      for(let c=1;c<=COLS;c++){
        const same = c<COLS && sameColor(g.grid[r][c], g.grid[r][c-1]);
        if(same) run++; 
        if(!same || c===COLS){
          if(run>=3){ groups.push(rangeCells(r,c-run,r,c-1)); }
          run=1;
        }
      }
    }
    // cols
    for(let c=0;c<COLS;c++){
      let run=1;
      for(let r=1;r<=ROWS;r++){
        const same = r<ROWS && sameColor(g.grid[r][c], g.grid[r-1][c]);
        if(same) run++;
        if(!same || r===ROWS){
          if(run>=3){ groups.push(rangeCells(r-run,c,r-1,c)); }
          run=1;
        }
      }
    }
    // merge overlaps
    return mergeGroups(groups);
  }
  const sameColor=(a,b)=> a && b && (a.color===b.color || a.type==='rainbow' || b.type==='rainbow');
  const rangeCells=(r1,c1,r2,c2)=>{
    const s=new Set();
    if(r1===r2){ for(let c=c1;c<=c2;c++) s.add(`${r1},${c}`); }
    else { for(let r=r1;r<=r2;r++) s.add(`${r},${c1}`); }
    return s;
  };
  const mergeGroups=(arr)=>{
    const used=Array(arr.length).fill(false), out=[];
    for(let i=0;i<arr.length;i++){
      if(used[i]) continue; let cur=new Set(arr[i]); used[i]=true;
      let changed=true;
      while(changed){
        changed=false;
        for(let j=0;j<arr.length;j++){
          if(used[j]) continue;
          for(const k of arr[j]){ if(cur.has(k)){ arr[j].forEach(x=>cur.add(x)); used[j]=true; changed=true; break; } }
        }
      }
      out.push(cur);
    }
    return out;
  };

  // Specials creation rules:
  // 5-in-a-row => rainbow
  // 4-in-a-row => striped (orientation)
  // T/L shape (overlap of row & col) => wrapped
  function resolve(groups, chain){
    // Detect special patterns and assign before clearing
    promoteSpecials(groups);

    // Clear groups
    let cleared=0;
    groups.forEach(set=>{
      set.forEach(key=>{
        const [r,c]=key.split(',').map(Number);
        if(g.grid[r][c]){ g.grid[r][c].el && g.grid[r][c].el.classList.add('boom'); cleared++; if(g.grid[r][c].color===g.goalColor) g.goalLeft=Math.max(0,g.goalLeft-1); g.grid[r][c]=null; }
      });
    });

    // Score
    const pts = cleared * 110 * chain;
    g.score += pts;

    // Explode striped/wrapped that were part of groups (promotion handled)
    // (Already null now; additional chain will come from cascades)

    collapseAndRefill();

    render(); updHUD();

    // Chain reactions
    const more = findMatches();
    if(more.length){ setTimeout(()=>resolve(more, chain+1), 140); return; }

    afterResolve(groups);
  }

  function afterResolve(groups){
    if(g.score>=TARGET && g.goalLeft===0){ levelEnd(true); return; }
    if(g.moves<=0){ levelEnd(false); return; }
    if(!hasAnyMove()){ toast('Aucun coup possible, mélange…'); reshuffle(); }
    g.busy=false; clearSel();
  }

  function promoteSpecials(groups){
    // map coverage per cell
    const cover = {};
    groups.forEach(set=> set.forEach(k=> cover[k]=(cover[k]||0)+1 ));
    // For each group, pick a pivot to upgrade
    groups.forEach(set=>{
      const cells = [...set].map(k=>k.split(',').map(Number));
      const isRow = cells.every(([r,_],i,arr)=> r===arr[0][0]);
      const isCol = cells.every(([_,c],i,arr)=> c===arr[0][1]);

      // detect 5 in a row/col
      if(cells.length>=5 && (isRow||isCol)){
        const piv = cells[Math.floor(cells.length/2)];
        setSpecial(piv[0],piv[1],'rainbow'); return;
      }
      // detect T/L by overlap (cell present in >=2 groups)
      const overlaps=[...set].filter(k=>cover[k]>=2);
      if(overlaps.length){ const [r,c]=overlaps[0].split(',').map(Number); setSpecial(r,c,'wrapped'); return; }

      // 4 in a line -> striped
      if(cells.length===4 && (isRow||isCol)){
        const [r,c]=cells[1]; setSpecial(r,c, isRow?'stripH':'stripV'); return;
      }
    });
  }

  function setSpecial(r,c,type){
    if(!g.grid[r][c]) return;
    // keep original color except rainbow
    const color = type==='rainbow' ? randColor() : g.grid[r][c].color;
    g.grid[r][c] = newCell(color,type);
  }

  function collapseAndRefill(){
    for(let c=0;c<COLS;c++){
      const col=[]; for(let r=0;r<ROWS;r++){ if(g.grid[r][c]) col.push(g.grid[r][c]); }
      const gaps = ROWS - col.length;
      const top = Array.from({length:gaps}, ()=> newCell(randColor()));
      for(let r=0;r<ROWS;r++){ g.grid[r][c] = r<gaps ? top[r] : col[r-gaps]; }
    }
  }

  // Utilities to force clears (rainbow, boosters)
  function forceClearColor(color){ const s=new Set(); for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) if(g.grid[r][c]?.color===color) s.add(`${r},${c}`); return s; }
  function clearColor(color){
    g.busy=true;
    const set = forceClearColor(color);
    resolve([set], 1);
    g.score += set.size * 50; updHUD();
  }

  function blast3x3(r,c){
    g.busy=true;
    const s=new Set();
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      const rr=r+dr, cc=c+dc; if(rr>=0&&rr<ROWS&&cc>=0&&cc<COLS) s.add(`${rr},${cc}`);
    }
    resolve([s],1);
    g.score += s.size*60; updHUD();
  }

  // Detect any possible move by virtual swap
  function hasAnyMove(){ return !!findFirstMove(); }
  function findFirstMove(){
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
      for(const [dr,dc] of dirs){
        const rr=r+dr, cc=c+dc; if(rr<0||rr>=ROWS||cc<0||cc>=COLS) continue;
        [g.grid[r][c], g.grid[rr][cc]] = [g.grid[rr][cc], g.grid[r][c]];
        const ok = findMatches().length>0 || g.grid[r][c].type==='rainbow' || g.grid[rr][cc].type==='rainbow';
        [g.grid[r][c], g.grid[rr][cc]] = [g.grid[rr][cc], g.grid[r][c]];
        if(ok) return {r,c,rr,cc};
      }
    }
    return null;
  }
  function reshuffle(){
    const pool=[]; for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) pool.push(g.grid[r][c].color);
    for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    let k=0; for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) g.grid[r][c]=newCell(pool[k++]);
    // avoid auto-matches at start; if still deadlock, reshuffle again
    while(findMatches().length>0 || !hasAnyMove()){ shuffleColors(); }
    render();
    function shuffleColors(){
      for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
      let idx=0; for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) g.grid[r][c].color=pool[idx++];
    }
  }

  // Level loop
  function levelEnd(win){
    g.busy=true; clearInterval(g.timer);
    if(win){
      toast('Niveau réussi ✨');
      const cur = document.querySelector(`.lvl[data-l="${g.level}"]`);
      cur && cur.classList.add('done');
      setTimeout(()=>{ g.level = g.level%g.total + 1; startLevel(); }, 900);
    } else {
      toast('Échec. On recommence.');
      setTimeout(()=>startLevel(), 800);
    }
  }

  function startLevel(){
    g.score=0; g.moves=20; g.time=120;
    g.goalColor = COLORS[Math.floor(Math.random()*COLORS.length)];
    g.goalLeft = 18 + Math.floor(g.level/2)*3;
    g.activeBooster=null;
    g.grid = makeGrid();
    // ensure: no immediate matches + at least one move
    while(findMatches().length>0) g.grid = makeGrid();
    if(!hasAnyMove()) reshuffle();

    render(); updHUD(); buildLevels();
    clearInterval(g.timer);
    g.timer = setInterval(()=>{ g.time--; ui.time.textContent=g.time; if(g.time<=0) levelEnd(false); },1000);
    g.busy=false; clearSel(); setBoosterUI();
  }

  function buildLevels(){
    const wrap = $('#levels'); if(wrap.dataset.built==='1') return;
    wrap.innerHTML=''; for(let i=1;i<=g.total;i++){
      const d=document.createElement('div'); d.className='lvl'+(i===g.level?' cur':''); d.dataset.l=i; d.textContent=i;
      d.addEventListener('click',()=>{ if(i<=g.level){ g.level=i; startLevel(); [...wrap.children].forEach(x=>x.classList.remove('cur')); d.classList.add('cur'); }});
      wrap.appendChild(d);
    }
    wrap.dataset.built='1';
  }

  // Boosters UI
  function setBoosterUI(){
    Object.values(ui.boosters).forEach(b=>b.classList.remove('active'));
    if(g.activeBooster==='bomb') ui.boosters.bomb.classList.add('active');
    if(g.activeBooster==='rainbow') ui.boosters.rainbow.classList.add('active');
    if(g.activeBooster==='sw') ui.boosters.sw.classList.add('active');
  }

  // Buttons
  $('#restart').addEventListener('click', ()=> startLevel());
  $('#hint').addEventListener('click', ()=>{
    const mv = findFirstMove();
    if(!mv){ toast('Pas de coup → mélange'); reshuffle(); return; }
    const a=g.grid[mv.r][mv.c].el, b=g.grid[mv.rr][mv.cc].el;
    [a,b].forEach(el=>{ el.classList.add('sel'); setTimeout(()=>el.classList.remove('sel'),900); });
  });
  $('#reshuffle').addEventListener('click', ()=>{ reshuffle(); toast('Mélange effectué'); });
  $('#sound').addEventListener('click', ()=>{
    SND.enabled = !SND.enabled;
    $('#sound').innerHTML = `<i class="fa-solid ${SND.enabled?'fa-volume-high':'fa-volume-xmark'}"></i> Son`;
    toast(SND.enabled?'Son ON':'Son OFF');
  });

  ui.boosters.bomb.addEventListener('click', ()=>{ if(g.inv.bomb<=0) return toast('Plus de bombes'); g.activeBooster=g.activeBooster==='bomb'?null:'bomb'; setBoosterUI(); toast('Clique une case pour 3×3'); });
  ui.boosters.rainbow.addEventListener('click', ()=>{ if(g.inv.rainbow<=0) return toast('Plus d’arc-en-ciel'); g.activeBooster=g.activeBooster==='rainbow'?null:'rainbow'; setBoosterUI(); toast('Clique une couleur à nettoyer'); });
  ui.boosters.sw.addEventListener('click', ()=>{ if(g.inv.sw<=0) return toast('Plus d’échanges'); g.activeBooster=g.activeBooster==='sw'?null:'sw'; setBoosterUI(); toast('Ton prochain swap est gratuit'); });
  ui.boosters.time.addEventListener('click', ()=>{ if(g.inv.time<=0) return toast('Plus de bonus temps'); g.inv.time--; g.time+=30; updHUD(); toast('+30s'); });

  // Init
  startLevel();
})();
