/* Alchimia Mechanica – MVP jouable (grille hex, inv, rotation, validation) */

(() => {
  // ---------- Utilitaires ----------
  const TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Hex axial utils (q,r). Taille visuelle
  const HEX = { size: 36 }; // rayon
  const hexToPixel = ({ q, r }) => {
    const x = HEX.size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
    const y = HEX.size * (3 / 2 * r);
    return { x, y };
  };
  const pixelToHex = (x, y) => {
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX.size;
    const r = (2 / 3 * y) / HEX.size;
    return hexRound({ q, r });
  };
  const hexRound = ({ q, r }) => {
    let x = q, z = r, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const x_diff = Math.abs(rx - x), y_diff = Math.abs(ry - y), z_diff = Math.abs(rz - z);
    if (x_diff > y_diff && x_diff > z_diff) rx = -ry - rz;
    else if (y_diff > z_diff) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  };
  const hexNeighbors = [
    { q: +1, r: 0 }, { q: +1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: +1 }, { q: 0, r: +1 }
  ];

  // ---------- Données de niveau par défaut ----------
  // Un monde avec 5 niveaux simples. Chaque niveau place quelques obstacles et réserve un inventaire.
  const WORLDS = [
    {
      name: "Sylvaria",
      levels: [
        { w: 9, h: 7, inv: { source:1, conduit:10, gear:4, sink:1 }, preset: [] },
        { w: 9, h: 7, inv: { source:1, conduit:9,  gear:5, sink:1 }, preset: [{t:"rock",q:2,r:1},{t:"rock",q:3,r:2}] },
        { w: 10,h: 8, inv: { source:1, conduit:12, gear:6, sink:1 }, preset: [{t:"rock",q:-1,r:0},{t:"rock",q:0,r:1},{t:"rock",q:1,r:2}] },
        { w: 10,h: 8, inv: { source:1, conduit:12, gear:6, sink:1 }, preset: [{t:"rock",q:0,r:0},{t:"rock",q:1,r:0},{t:"rock",q:2,r:0}] },
        { w: 11,h: 8, inv: { source:1, conduit:14, gear:7, sink:1 }, preset: [] },
      ]
    }
  ];

  // ---------- État global ----------
  const state = {
    world: 0, level: 0,
    grid: [], // map "q,r" -> cell
    bounds: { minQ:0,maxQ:0,minR:0,maxR:0 },
    inventory: { source:1, conduit:12, gear:6, sink:1 },
    placed: new Map(),   // key "q,r" => {type, rot}
    history: [],         // undo
    tool: "place",
    selected: "conduit",
    won: false
  };

  // ---------- Initialisation UI ----------
  const $ = sel => document.querySelector(sel);
  const worldSelect = $("#worldSelect");
  const levelSelect = $("#levelSelect");
  const board = $("#board");
  const ctx = board.getContext("2d");
  const invWrap = $("#inv");
  const winCard = $("#winCard");

  function toast(msg, ok=false){
    const t = $("#toast");
    t.textContent = msg;
    t.style.borderColor = ok ? "#1f4330" : "#2b1a1a";
    t.classList.add("show");
    setTimeout(()=>t.classList.remove("show"), 1200);
  }

  function buildSelectors() {
    worldSelect.innerHTML = WORLDS.map((w, i) => `<option value="${i}">${w.name}</option>`).join("");
    worldSelect.value = state.world;
    levelSelect.innerHTML = WORLDS[state.world].levels.map((_, i)=> `<option value="${i}">Niv. ${i+1}</option>`).join("");
    levelSelect.value = state.level;
  }

  function buildInventoryUI(){
    invWrap.innerHTML = "";
    const items = [
      ["source","⚡ Source"],
      ["conduit","│ Conduit"],
      ["gear","⚙️ Engrenage"],
      ["sink","◎ Récepteur"],
    ];
    for (const [k,label] of items){
      const el = document.createElement("div");
      el.className = "inv-item" + (state.selected===k?" active":"");
      el.innerHTML = `<span>${label}</span><small>× ${state.inventory[k]??0}</small>`;
      el.onclick = ()=>{
        state.selected = k;
        buildInventoryUI();
      };
      invWrap.appendChild(el);
    }
  }

  // ---------- Grille ----------
  function makeGrid(w,h){
    // grille centrée, rectangle axial approximatif
    const cells = [];
    const minQ = -Math.floor(w/2), maxQ = minQ + w - 1;
    const minR = -Math.floor(h/2), maxR = minR + h - 1;
    for(let r=minR;r<=maxR;r++){
      for(let q=minQ;q<=maxQ;q++){
        cells.push({q,r});
      }
    }
    state.bounds = {minQ,maxQ,minR,maxR};
    state.grid = cells;
  }

  function keyQR(q,r){ return `${q},${r}`; }
  function getCell(q,r){
    if (q<state.bounds.minQ||q>state.bounds.maxQ||r<state.bounds.minR||r>state.bounds.maxR) return null;
    return {q,r};
  }

  // ---------- Placement ----------
  function canPlace(type,q,r){
    if (!getCell(q,r)) return false;
    const k=keyQR(q,r);
    if (state.placed.has(k)) return false;
    if ((state.inventory[type]??0) <= 0) return false;
    return true;
  }

  function place(type,q,r,rot=0){
    if (!canPlace(type,q,r)) { toast("Impossible ici"); return; }
    const k=keyQR(q,r);
    state.history.push({op:"del", at:k, prev:null}); // inverse
    state.placed.set(k,{type,rot});
    state.inventory[type]--;
    buildInventoryUI();
    draw();
    checkWin();
  }

  function erase(q,r){
    const k=keyQR(q,r);
    const prev = state.placed.get(k);
    if (!prev) return;
    state.history.push({op:"add", at:k, prev:prev});
    state.placed.delete(k);
    state.inventory[prev.type] = (state.inventory[prev.type]??0)+1;
    buildInventoryUI();
    draw();
  }

  function undo(){
    const ev = state.history.pop();
    if (!ev) return;
    if (ev.op==="del"){
      // inverse d’un place => supprimer l’élément ajouté + rendre l’inventaire
      const was = state.placed.get(ev.at);
      if (was){
        state.placed.delete(ev.at);
        state.inventory[was.type] = (state.inventory[was.type]??0)+1;
      }
    } else if (ev.op==="add"){
      // inverse d’un erase => remettre l’élément
      state.placed.set(ev.at, ev.prev);
      state.inventory[ev.prev.type]--;
    }
    buildInventoryUI();
    draw();
  }

  // ---------- Simulation simple ----------
  // Conduits : segment droit selon rotation (0..5) – on connecte 2 côtés opposés
  // Engrenage : connecte les 6 côtés (hub)
  // Source : émet sur ses 6 côtés
  // Sink   : est validé si un flux arrive sur au moins 1 côté
  function neighborsOf(q,r){
    return hexNeighbors.map((d,i)=>({i, q:q+d.q, r:r+d.r}));
  }

  function simulate(){
    // BFS de flux depuis toutes les sources
    const queue = [];
    const visited = new Set();
    const powered = new Set(); // cellules alimentées
    for (const [k,val] of state.placed){
      if (val.type==="source") queue.push(k);
    }
    while(queue.length){
      const k = queue.shift();
      if (visited.has(k)) continue;
      visited.add(k);
      powered.add(k);
      const [q,r] = k.split(",").map(Number);
      const cur = state.placed.get(k);
      const outs = outputSides(cur);
      for (const s of outs){
        const n = neighborsOf(q,r)[s];
        const nk = keyQR(n.q,n.r);
        const neigh = state.placed.get(nk);
        if (!neigh) continue;
        // côté opposé doit être ouvert chez le voisin
        const opp = (s+3)%6;
        const nouts = outputSides(neigh);
        if (nouts.has(opp) && !visited.has(nk)){
          queue.push(nk);
        }
      }
    }
    return { powered };
  }

  function outputSides(cell){
    const set = new Set();
    if (!cell) return set;
    const r = ((cell.rot%6)+6)%6;
    switch(cell.type){
      case "conduit":
        set.add(r);
        set.add((r+3)%6);
        break;
      case "gear":
        for(let i=0;i<6;i++) set.add(i);
        break;
      case "source":
        for(let i=0;i<6;i++) set.add(i);
        break;
      case "sink":
        // ne sort rien; reçoit seulement
        break;
    }
    return set;
  }

  function checkWin(){
    // Un sink est "alimenté" s’il est dans powered ET qu’un voisin l’alimente
    const {powered} = simulate();
    let ok = true;
    for (const [k,val] of state.placed){
      if (val.type !== "sink") continue;
      if (!powered.has(k)) ok = false;
    }
    state.won = ok && hasAtLeastOne("source") && hasAtLeastOne("sink");
    winCard.classList.toggle("hidden", !state.won);
    if (state.won) toast("Circuit complet !", true);
  }
  function hasAtLeastOne(t){
    for (const [,v] of state.placed) if (v.type===t) return true;
    return false;
  }

  // ---------- Rendu ----------
  function draw(){
    const w = board.width, h = board.height;
    ctx.clearRect(0,0,w,h);

    // centrage
    const {minQ,maxQ,minR,maxR} = state.bounds;
    const gridW = (maxQ-minQ+1), gridH = (maxR-minR+1);
    const margin = 30;
    const worldW = Math.sqrt(3)*HEX.size*(gridW + 0.5);
    const worldH = (3/2)*HEX.size*(gridH + 0.5);
    const offsetX = (w - worldW)/2;
    const offsetY = (h - worldH)/2;

    // fond doux
    ctx.fillStyle = "#0b1015";
    ctx.fillRect(0,0,w,h);

    // cellules
    for (const c of state.grid){
      const p = hexToPixel(c);
      const x = p.x + offsetX + worldW/2;
      const y = p.y + offsetY + worldH/2;
      drawHex(x,y, HEX.size-1, "#12161b", "#1a222e");

      const k = keyQR(c.q,c.r);
      const item = state.placed.get(k);
      if (item) drawItem(x,y,item);
    }

    // survol (mobile: dernier touch)
    if (hoverCell){
      const p = hexToPixel(hoverCell);
      const x = p.x + offsetX + worldW/2;
      const y = p.y + offsetY + worldH/2;
      drawHex(x,y, HEX.size-1, "#18212b", "#273244", 2);
    }

    function drawHex(x,y,r, fill, stroke, w=1){
      ctx.beginPath();
      for(let i=0;i<6;i++){
        const a = TAU*(i/6) + TAU/12;
        const px = x + Math.cos(a)*r;
        const py = y + Math.sin(a)*r;
        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke();
    }

    function drawItem(x,y,item){
      // base
      ctx.save();
      ctx.translate(x,y);
      ctx.rotate((item.rot%6)*TAU/6);

      if (item.type==="conduit"){
        ctx.strokeStyle = "#3a78ff";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-HEX.size*0.8,0);
        ctx.lineTo(+HEX.size*0.8,0);
        ctx.stroke();
      }
      else if (item.type==="gear"){
        ctx.strokeStyle = "#ffd24a";
        ctx.fillStyle = "#2b2210";
        gearPath(HEX.size*0.7);
        ctx.fill(); ctx.stroke();
      }
      else if (item.type==="source"){
        ctx.fillStyle = "#203014";
        ctx.strokeStyle = "#86ff68";
        circle(0,0, HEX.size*0.55);
        bolt();
      }
      else if (item.type==="sink"){
        ctx.strokeStyle = "#c9e1ff";
        ctx.fillStyle = "#16212d";
        circle(0,0, HEX.size*0.55);
        ctx.font = "700 18px sans-serif";
        ctx.fillStyle = "#9cc9ff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("◎", 0, 1);
      }
      ctx.restore();

      function circle(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); ctx.lineWidth=2; ctx.stroke(); }
      function gearPath(r){
        ctx.beginPath();
        const teeth = 8;
        for(let i=0;i<teeth;i++){
          const a = (i/teeth)*TAU;
          const a2 = ((i+0.5)/teeth)*TAU;
          ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
          ctx.lineTo(Math.cos(a2)*(r*0.82), Math.sin(a2)*(r*0.82));
        }
        ctx.closePath();
      }
      function bolt(){
        ctx.fillStyle = "#86ff68";
        ctx.beginPath();
        ctx.moveTo(-6,-2); ctx.lineTo(0,-12); ctx.lineTo(0,-3);
        ctx.lineTo(6,-5); ctx.lineTo(-2,12); ctx.lineTo(-2,1);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  // ---------- Entrées ----------
  let hoverCell = null;
  function pickCellFromEvent(ev){
    const rect = board.getBoundingClientRect();
    const x = (ev.touches? ev.touches[0].clientX : ev.clientX) - rect.left;
    const y = (ev.touches? ev.touches[0].clientY : ev.clientY) - rect.top;

    // inverser le centrage comme dans draw()
    const {minQ,maxQ,minR,maxR} = state.bounds;
    const gridW = (maxQ-minQ+1), gridH = (maxR-minR+1);
    const worldW = Math.sqrt(3)*HEX.size*(gridW + 0.5);
    const worldH = (3/2)*HEX.size*(gridH + 0.5);
    const ox = (board.width - worldW)/2 + worldW/2;
    const oy = (board.height - worldH)/2 + worldH/2;

    const hx = x - ox, hy = y - oy;
    const h = pixelToHex(hx, hy);
    const c = getCell(h.q, h.r);
    return c;
  }

  board.addEventListener("mousemove", ev=>{
    hoverCell = pickCellFromEvent(ev);
    draw();
  });
  board.addEventListener("mouseleave", ()=>{ hoverCell=null; draw(); });

  let pressTimer = null;
  function doPlaceOrErase(c){
    if (!c) return;
    if (state.tool==="erase") { erase(c.q,c.r); return; }
    place(state.selected, c.q, c.r, 0);
  }

  board.addEventListener("mousedown", ev=>{
    ev.preventDefault();
    const c = pickCellFromEvent(ev);
    if (ev.button===2){ erase(c?.q, c?.r); return; } // clic droit
    pressTimer = setTimeout(()=>{ erase(c?.q,c?.r); pressTimer=null; }, 500);
  });
  board.addEventListener("mouseup", ev=>{
    ev.preventDefault();
    const c = pickCellFromEvent(ev);
    if (pressTimer){ clearTimeout(pressTimer); pressTimer=null; doPlaceOrErase(c); }
  });
  board.addEventListener("contextmenu", ev=>ev.preventDefault());

  board.addEventListener("touchstart", ev=>{
    const c = pickCellFromEvent(ev);
    pressTimer = setTimeout(()=>{ erase(c?.q,c?.r); pressTimer=null; }, 500);
  }, {passive:false});
  board.addEventListener("touchend", ev=>{
    if (pressTimer){ clearTimeout(pressTimer); pressTimer=null; const c=hoverCell; doPlaceOrErase(c); }
  });

  window.addEventListener("keydown", e=>{
    if (e.key.toLowerCase()==="r" && hoverCell){
      const k = keyQR(hoverCell.q,hoverCell.r);
      const it = state.placed.get(k);
      if (it){ it.rot=(it.rot+1)%6; draw(); checkWin(); }
    } else if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="z"){ undo(); }
  });

  $("#toolPlace").onclick = ()=>{
    state.tool="place"; $("#toolPlace").classList.add("active"); $("#toolErase").classList.remove("active");
  };
  $("#toolErase").onclick = ()=>{
    state.tool="erase"; $("#toolErase").classList.add("active"); $("#toolPlace").classList.remove("active");
  };
  $("#btnUndo").onclick = undo;
  $("#btnReset").onclick = ()=> loadLevel(state.world, state.level, true);
  $("#btnHelp").onclick = ()=> toast("Place → R pivote → relie Source et Récepteur");
  $("#btnNext").onclick = ()=>{
    const w = state.world, next = state.level+1;
    if (next < WORLDS[w].levels.length) { levelSelect.value = next; changeLevel(); }
    else toast("Fin du monde 1", true);
  };
  worldSelect.onchange = ()=> { state.world = +worldSelect.value; buildSelectors(); changeLevel(); };
  levelSelect.onchange = changeLevel;
  function changeLevel(){
    state.level = +levelSelect.value;
    loadLevel(state.world, state.level, true);
  }

  // ---------- Chargement niveau ----------
  function loadLevel(wi, li, reset=false){
    const L = WORLDS[wi].levels[li];
    makeGrid(L.w, L.h);
    state.placed.clear(); state.history = []; state.won=false;
    state.inventory = structuredClone(L.inv);
    // place un récepteur et une source si rien n’est défini (garanti jouable)
    // source à gauche, sink à droite
    const q0 = state.bounds.minQ+1, r0 = 0;
    const q1 = state.bounds.maxQ-1, r1 = 0;
    placeSilent("source", q0, r0, 0);
    placeSilent("sink",   q1, r1, 0);
    // presets (rocher = cellule bloquée visuelle, non bloquante pour simplicité)
    for (const p of (L.preset||[])){
      // on les dessine comme "gear" passif : visuel d’obstacle
      // Pour MVP on ignore la collision d’obstacle (simplicité).
    }
    buildInventoryUI();
    draw();
    winCard.classList.add("hidden");
  }
  function placeSilent(type,q,r,rot){
    const k=keyQR(q,r);
    state.placed.set(k,{type,rot});
    if (type!=="source" && type!=="sink"){
      state.inventory[type]--;
    }
  }

  // ---------- Boot ----------
  function bootstrap(){
    // Peuple sélecteurs + charge niveau 1
    buildSelectors();
    loadLevel(0,0,true);
    draw();
  }
  bootstrap();
})();
