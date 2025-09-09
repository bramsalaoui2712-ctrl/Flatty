/* Alchimia Mechanica – MVP Hex Grid
 * - Hex axial coords (q,r), pointy top
 * - Pieces: SOURCE, CONDUIT, GEAR, SINK
 * - Rotate with 'R' (or bouton rotation inventaire)
 * - Remove with right-click / long press
 * - Energy simulation each tick from sources → visit graph via piece ports
 */

(() => {
  // ---------- Geometry: hex axial (pointy) ----------
  const TAU = Math.PI * 2;
  const HEX_DIRECTIONS = [
    { q: +1, r: 0 },   // 0: E
    { q: +1, r: -1 },  // 1: NE
    { q: 0,  r: -1 },  // 2: NW
    { q: -1, r: 0 },   // 3: W
    { q: -1, r: +1 },  // 4: SW
    { q: 0,  r: +1 },  // 5: SE
  ];

  function addAx(a,b){ return { q:a.q+b.q, r:a.r+b.r }; }
  function axialEq(a,b){ return a.q===b.q && a.r===b.r; }

  // Layout
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // Grid params
  const CELL = 36; // hex radius
  const ORIGIN = { x: W/2, y: H/2 };
  const GRID_RADIUS = 6; // roughly ~ 127 cells
  const SQRT3 = Math.sqrt(3);

  function axialToPixel(q,r){
    const x = CELL * (SQRT3 * q + SQRT3/2 * r);
    const y = CELL * (3/2 * r);
    return { x: ORIGIN.x + x, y: ORIGIN.y + y };
  }
  function pixelToAxial(x,y){
    const px = x - ORIGIN.x;
    const py = y - ORIGIN.y;
    const q = (SQRT3/3 * px - 1/3 * py) / CELL;
    const r = (2/3 * py) / CELL;
    return axialRound(q,r);
  }
  function axialRound(qf, rf){
    let sf = -qf - rf;
    let q = Math.round(qf);
    let r = Math.round(rf);
    let s = Math.round(sf);
    const qDiff = Math.abs(q - qf);
    const rDiff = Math.abs(r - rf);
    const sDiff = Math.abs(s - sf);
    if (qDiff > rDiff && qDiff > sDiff) q = -r - s;
    else if (rDiff > sDiff) r = -q - s;
    return { q, r };
  }

  function hexPolygon(x,y){
    const pts = [];
    for (let i=0;i<6;i++){
      const a = TAU * (i+0.5)/6; // pointy
      pts.push({ x: x + CELL*Math.cos(a), y: y + CELL*Math.sin(a) });
    }
    return pts;
  }

  // ---------- Level & Pieces ----------
  const PieceType = {
    EMPTY: 'EMPTY',
    SOURCE: 'SOURCE',
    CONDUIT: 'CONDUIT', // straight line through opposite sides (dir pairs)
    GEAR: 'GEAR',       // turns energy by +60° (right turn) or -60° (left turn)
    SINK: 'SINK',
  };

  const ROT = (v, n)=> ((v % n) + n) % n;

  // For each piece, which sides (0..5) accept/emit energy.
  // CONDUIT: two opposite ports depending on rotation (rot = 0 aligns with directions 0-3, then +1 rotates)
  function piecePorts(piece){
    switch (piece.type){
      case PieceType.SOURCE:
        return [piece.rot % 6]; // emits on one side (rot)
      case PieceType.SINK:
        return [piece.rot % 6]; // accepts on one side (rot) but in sim we treat specially
      case PieceType.CONDUIT:{
        // straight pipe through opposite sides
        // rot 0 => ports [0,3], rot 1 => [1,4], rot 2 => [2,5], etc.
        const a = piece.rot % 3; // 0..2 representative (since opposite repeats every 3)
        const pairs = [[0,3],[1,4],[2,5]];
        return pairs[a];
      }
      case PieceType.GEAR:
        // accepts on all, emits to one turned side (+60°) → we handle in routing
        return [0,1,2,3,4,5];
      default: return [];
    }
  }

  function nextDirsThrough(piece, incomingDir){
    // incomingDir: from which side (0..5) energy enters
    switch (piece.type){
      case PieceType.CONDUIT:{
        const ports = piecePorts(piece);
        // only pass if incoming is one port, exit is the opposite port
        if (!ports.includes(incomingDir)) return [];
        const opposite = ROT(incomingDir+3, 6);
        if (ports.includes(opposite)) return [opposite];
        return [];
      }
      case PieceType.GEAR:{
        // turn +60° or -60° depending on rot parity (simple flavor)
        // rot even: +60 (right), rot odd: -60 (left)
        const turn = (piece.rot % 2 === 0) ? +1 : -1;
        return [ ROT(incomingDir + turn, 6) ];
      }
      case PieceType.SINK:
        // absorbs energy; no outgoing
        return [];
      case PieceType.SOURCE:
        // energy originates, not routed by incoming
        return [];
      default:
        return [];
    }
  }

  // Inventory (counts)
  const inventory = [
    { id:'SOURCE',   type:PieceType.SOURCE,  count:1,  label:'Source' },
    { id:'CONDUIT',  type:PieceType.CONDUIT, count:12, label:'Conduit' },
    { id:'GEAR',     type:PieceType.GEAR,    count:6,  label:'Engrenage' },
    { id:'SINK',     type:PieceType.SINK,    count:1,  label:'Récepteur' },
  ];
  let selectedItem = 'CONDUIT';

  // Grid store: Map "q,r" -> piece
  const grid = new Map();
  function keyQR(q,r){ return `${q},${r}`; }

  // Seed level: place a Source et une Sink fixes (bord opposé), reste au joueur
  const startCells = [];
  function seedLevel(){
    grid.clear();
    // Place source et sink
    const src = { q: -GRID_RADIUS+1, r: 0, type:PieceType.SOURCE, rot:0 };
    const snk = { q: GRID_RADIUS-1, r: 0, type:PieceType.SINK, rot:3 }; // face vers la gauche
    grid.set(keyQR(src.q,src.r), src);
    grid.set(keyQR(snk.q,snk.r), snk);
    startCells.splice(0,startCells.length, {q:src.q,r:src.r}, {q:snk.q,r:snk.r});
  }
  seedLevel();

  // ---------- Input handling ----------
  let hoverHex = null;
  let longPressTimer = null;

  canvas.addEventListener('mousemove', e => {
    const {left,top} = canvas.getBoundingClientRect();
    const hex = pixelToAxial(e.clientX - left, e.clientY - top);
    hoverHex = inBounds(hex) ? hex : null;
    draw();
  });
  canvas.addEventListener('mouseleave', ()=>{ hoverHex=null; draw(); });

  // Place / remove
  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    const hex = cursorHex(e);
    if (!hex) return;

    if (e.button === 2){ // right click remove
      removeAt(hex);
      draw();
      return;
    }
    // left click place
    placeAt(hex);
    draw();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Mobile long press = remove
  canvas.addEventListener('touchstart', e => {
    const hex = cursorHex(e.touches[0]);
    if (!hex) return;
    longPressTimer = setTimeout(() => { removeAt(hex); draw(); }, 520);
  }, {passive:true});
  canvas.addEventListener('touchend', () => { if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } }, {passive:true});
  canvas.addEventListener('touchmove', () => { if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } }, {passive:true});

  // Rotate selection or piece under cursor
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase()==='r'){
      if (hoverHex && rotateAt(hoverHex)) { draw(); return; }
      // sinon on oriente la sélection par défaut
      selRot = ROT(selRot+1,6);
      draw();
    }
  });

  // ---------- Inventory UI ----------
  const invEl = document.getElementById('inventory');
  const statusEl = document.getElementById('status');
  const hintEl = document.getElementById('hint');
  const btnReset = document.getElementById('btn-reset');

  let selRot = 0; // rotation par défaut pour la pièce en main

  function renderInventory(){
    invEl.innerHTML = `
      <div class="inv-title">Inventaire</div>
      ${inventory.map(item => `
        <div class="inv-item ${selectedItem===item.id?'sel':''}" data-id="${item.id}">
          <span>${symbolOf(item.type)} ${item.label}</span>
          <span class="badge">× ${item.count}</span>
        </div>
      `).join('')}
      <div class="inv-title">Contrôles</div>
      <div class="tag">Rotation <kbd>R</kbd> (${selRot}×60°)</div>
      <div class="tag">Supprimer : clic droit / appui long</div>
    `;
    invEl.querySelectorAll('.inv-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        selectedItem = el.dataset.id;
        renderInventory(); draw();
      });
    });
  }
  btnReset.addEventListener('click', ()=>{ seedLevel(); renderInventory(); draw(); });

  function symbolOf(t){
    switch (t){
      case PieceType.SOURCE: return '⚡';
      case PieceType.SINK: return '◎';
      case PieceType.CONDUIT: return '│';
      case PieceType.GEAR: return '⚙';
      default: return '·';
    }
  }

  // ---------- Placement logic ----------
  function inBounds({q,r}){
    // hex disc
    return (Math.abs(q) <= GRID_RADIUS && Math.abs(r) <= GRID_RADIUS && Math.abs(q+r) <= GRID_RADIUS);
  }
  function occupied({q,r}){
    return grid.has(keyQR(q,r));
  }
  function isStartCell({q,r}){
    return startCells.some(c => c.q===q && c.r===r);
  }
  function cursorHex(evt){
    const {left,top} = canvas.getBoundingClientRect();
    const hex = pixelToAxial(evt.clientX - left, evt.clientY - top);
    return inBounds(hex) ? hex : null;
  }

  function placeAt(hex){
    if (!inBounds(hex)) return false;
    if (isStartCell(hex)){
      // on ne remplace pas Source/Sink
      return false;
    }
    const item = inventory.find(i => i.id===selectedItem);
    if (!item || item.count<=0) return false;

    // Place piece
    const piece = { type:item.type, rot: selRot, q:hex.q, r:hex.r };
    grid.set(keyQR(hex.q,hex.r), piece);
    item.count--;
    renderInventory();
    return true;
  }

  function rotateAt(hex){
    const k = keyQR(hex.q,hex.r);
    const piece = grid.get(k);
    if (!piece || piece.type===PieceType.SOURCE || piece.type===PieceType.SINK) return false;
    piece.rot = ROT(piece.rot+1, 6);
    return true;
  }

  function removeAt(hex){
    const k = keyQR(hex.q,hex.r);
    const piece = grid.get(k);
    if (!piece || piece.type===PieceType.SOURCE || piece.type===PieceType.SINK) return false;
    grid.delete(k);
    // rendre au stock
    const inv = inventory.find(i => i.type===piece.type);
    if (inv) inv.count++;
    renderInventory();
    return true;
  }

  // ---------- Energy simulation ----------
  // We propagate from all SOURCES. For SOURCE with rot=d, initial edge = d towards neighbor.
  // We BFS along connections, honoring piece routing.
  function simulate(){
    const visited = new Set(); // key "q,r:dirIn" to avoid loops
    let reachedSink = false;

    // gather sources
    const sources = [];
    grid.forEach(p=>{
      if (p.type===PieceType.SOURCE) sources.push(p);
    });

    const queue = [];
    for (const s of sources){
      const outDir = ROT(s.rot,6);
      const n = addAx({q:s.q,r:s.r}, HEX_DIRECTIONS[outDir]);
      if (!inBounds(n)) continue;
      queue.push({ from:{q:s.q,r:s.r}, to:n, dirOut:outDir });
    }

    const hotEdges = []; // for rendering the energized links
    const hotCells = new Set();

    while (queue.length){
      const edge = queue.shift();
      const {to, dirOut, from} = edge;
      const incomingDir = ROT(dirOut + 3, 6); // neighbor sees energy arriving from opposite
      const kIn = `${to.q},${to.r}:${incomingDir}`;
      if (visited.has(kIn)) continue;
      visited.add(kIn);

      const piece = grid.get(keyQR(to.q,to.r));
      if (!piece){
        // empty cell absorbs nothing
        continue;
      }

      hotCells.add(keyQR(to.q,to.r));
      hotEdges.push({ from, to });

      if (piece.type===PieceType.SINK){
        // Check if sink facing the incoming side
        const acceptSide = piecePorts(piece)[0];
        if (acceptSide === incomingDir){
          reachedSink = true;
        }
        continue;
      }

      if (piece.type===PieceType.SOURCE){
        // sources emit only; but if energy "arrives" there we stop
        continue;
      }

      // Check port compatibility
      const ports = piecePorts(piece);
      if (!ports.includes(incomingDir)){
        // this piece can't accept from this side
        continue;
      }

      // Route to next dirs
      const outs = nextDirsThrough(piece, incomingDir);
      for (const nd of outs){
        const n2 = addAx({q:to.q,r:to.r}, HEX_DIRECTIONS[nd]);
        if (!inBounds(n2)) continue;
        queue.push({ from:{q:to.q,r:to.r}, to:n2, dirOut: nd });
      }
    }

    return { hotEdges, hotCells, reachedSink };
  }

  // ---------- Rendering ----------
  function draw(){
    ctx.clearRect(0,0,W,H);
    // grid background
    drawGrid();
    // pieces
    drawPieces();
    // energy
    const sim = simulate();
    drawEnergy(sim.hotEdges, sim.hotCells);
    setStatus(sim.reachedSink);
    // hover
    if (hoverHex) drawHover(hoverHex);
  }

  function drawGrid(){
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1f2430';
    forEachHex(cell=>{
      const p = axialToPixel(cell.q,cell.r);
      const poly = hexPolygon(p.x,p.y);
      ctx.beginPath();
      poly.forEach((pt,i)=> i? ctx.lineTo(pt.x,pt.y): ctx.moveTo(pt.x,pt.y));
      ctx.closePath();
      ctx.stroke();
    });
  }

  function forEachHex(fn){
    for (let q=-GRID_RADIUS; q<=GRID_RADIUS; q++){
      for (let r=-GRID_RADIUS; r<=GRID_RADIUS; r++){
        if (Math.abs(q+r) > GRID_RADIUS) continue;
        fn({q,r});
      }
    }
  }

  function drawPieces(){
    grid.forEach(piece=>{
      const p = axialToPixel(piece.q, piece.r);
      // cell bg if start
      if (isStartCell(piece)){
        ctx.fillStyle = '#182026';
        const poly = hexPolygon(p.x,p.y);
        ctx.beginPath(); poly.forEach((pt,i)=> i? ctx.lineTo(pt.x,pt.y): ctx.moveTo(pt.x,pt.y)); ctx.closePath();
        ctx.fill();
      }
      switch (piece.type){
        case PieceType.SOURCE: drawSource(p, piece.rot); break;
        case PieceType.SINK:   drawSink(p, piece.rot); break;
        case PieceType.CONDUIT:drawConduit(p, piece.rot); break;
        case PieceType.GEAR:   drawGear(p, piece.rot); break;
      }
    });
  }

  function drawEnergy(edges, cells){
    // energized cells glow
    cells.forEach(k=>{
      const [q,r] = k.split(',').map(Number);
      const p = axialToPixel(q,r);
      const grd = ctx.createRadialGradient(p.x,p.y,2, p.x,p.y, CELL*0.9);
      grd.addColorStop(0, 'rgba(245,177,74,0.35)');
      grd.addColorStop(1, 'rgba(245,177,74,0.0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      const poly = hexPolygon(p.x,p.y);
      poly.forEach((pt,i)=> i? ctx.lineTo(pt.x,pt.y): ctx.moveTo(pt.x,pt.y)); ctx.closePath();
      ctx.fill();
    });

    // energized links
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f5b14a';
    ctx.lineCap = 'round';
    edges.forEach(e=>{
      const a = axialToPixel(e.from.q, e.from.r);
      const b = axialToPixel(e.to.q, e.to.r);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  function setStatus(win){
    statusEl.textContent = win ? 'Connexion établie !' : '';
    statusEl.className = win ? 'win' : '';
    hintEl.textContent = win ? 'Bravo ! Appuie sur ↺ pour rejouer.' : 'Relie la Source au Récepteur avec les pièces.';
  }

  function drawHover(hex){
    if (occupied(hex) && !isStartCell(hex)){
      // outline red if occupied
      const p = axialToPixel(hex.q, hex.r);
      const poly = hexPolygon(p.x,p.y);
      ctx.lineWidth = 2; ctx.strokeStyle = '#ff6b6b';
      ctx.beginPath(); poly.forEach((pt,i)=> i? ctx.lineTo(pt.x,pt.y): ctx.moveTo(pt.x,pt.y)); ctx.closePath(); ctx.stroke();
      return;
    }
    const p = axialToPixel(hex.q, hex.r);
    const poly = hexPolygon(p.x,p.y);
    ctx.lineWidth = 2; ctx.strokeStyle = '#3a4050';
    ctx.beginPath(); poly.forEach((pt,i)=> i? ctx.lineTo(pt.x,pt.y): ctx.moveTo(pt.x,pt.y)); ctx.closePath(); ctx.stroke();

    // ghost piece
    const item = inventory.find(i=>i.id===selectedItem);
    if (item && item.count>0){
      ctx.globalAlpha = 0.6;
      switch (item.type){
        case PieceType.SOURCE: drawSource(p, selRot); break;
        case PieceType.SINK: drawSink(p, selRot); break;
        case PieceType.CONDUIT: drawConduit(p, selRot); break;
        case PieceType.GEAR: drawGear(p, selRot); break;
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Piece drawings ----------
  function drawSource(p, rot){
    drawHexInset(p, '#1d2330');
    arrowFromCenter(p, rot, '#f5b14a');
    dot(p, 6, '#f5b14a');
  }
  function drawSink(p, rot){
    drawHexInset(p, '#1a2027');
    ring(p, 12, '#9aa3b2');
    arrowToCenter(p, rot, '#cbd3e3');
  }
  function drawConduit(p, rot){
    drawHexInset(p, '#151a20');
    const pairIndex = (rot%3);
    const dirs = [[0,3],[1,4],[2,5]][pairIndex];
    pipe(p, dirs[0], dirs[1], '#cfd6e6');
  }
  function drawGear(p, rot){
    drawHexInset(p, '#171c22');
    gear(p, 12, '#b9c2d6');
    // tiny arrow indicating turn direction (even=right, odd=left)
    const dir = (rot%2===0) ? +1 : -1;
    smallTurnArrow(p, dir, '#8fa3c2');
  }

  // helpers
  function drawHexInset(p, fill){
    const poly = hexPolygon(p.x,p.y).map(pt => {
      const v = { x: pt.x - p.x, y: pt.y - p.y };
      const len = Math.hypot(v.x,v.y);
      const k = (len-4)/len;
      return { x: p.x + v.x*k, y: p.y + v.y*k };
    });
    ctx.fillStyle = fill;
    ctx.beginPath();
    poly.forEach((pt,i)=> i? ctx.lineTo(pt.x,pt.y): ctx.moveTo(pt.x,pt.y));
    ctx.closePath(); ctx.fill();
  }
  function dirVector(d, scale=1){
    const a = TAU * (d+0.5)/6;
    return { x: Math.cos(a)*scale, y: Math.sin(a)*scale };
  }
  function arrowFromCenter(p, dir, color){
    const v = dirVector(dir, CELL*0.72);
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x+v.x, p.y+v.y); ctx.stroke();
    arrowHead(p.x+v.x, p.y+v.y, Math.atan2(v.y,v.x), color);
  }
  function arrowToCenter(p, dir, color){
    const v = dirVector(dir, CELL*0.72);
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(p.x+v.x, p.y+v.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    arrowHead(p.x, p.y, Math.atan2(-v.y,-v.x), color);
  }
  function arrowHead(x,y,ang,color){
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8*Math.cos(ang-0.35), y - 8*Math.sin(ang-0.35));
    ctx.lineTo(x - 8*Math.cos(ang+0.35), y - 8*Math.sin(ang+0.35));
    ctx.closePath(); ctx.fill();
  }
  function ring(p, r, color){
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,TAU); ctx.stroke();
  }
  function dot(p, r, color){
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,TAU); ctx.fill();
  }
  function pipe(p, dA, dB, color){
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap='round';
    [dA,dB].forEach(d=>{
      const v = dirVector(d, CELL*0.72);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x+v.x, p.y+v.y); ctx.stroke();
    });
  }
  function gear(p, r, color){
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,TAU); ctx.stroke();
    for (let i=0;i<6;i++){
      const v = dirVector(i, r);
      ctx.beginPath();
      ctx.moveTo(p.x + v.x*0.7, p.y + v.y*0.7);
      ctx.lineTo(p.x + v.x*1.15, p.y + v.y*1.15);
      ctx.stroke();
    }
  }
  function smallTurnArrow(p, dir, color){
    // dir: +1 clockwise, -1 counterclockwise
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x,p.y, 18, dir>0 ? Math.PI*0.1 : Math.PI*0.9, dir>0 ? Math.PI*1.5 : -Math.PI*0.4);
    ctx.stroke();
    // little head
    const endAng = dir>0 ? Math.PI*1.5 : -Math.PI*0.4;
    arrowHead(p.x + 18*Math.cos(endAng), p.y + 18*Math.sin(endAng), endAng, color);
  }

  // ---------- Kick ----------
  renderInventory();
  draw();
})();
