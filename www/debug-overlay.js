(function () {
  function box() {
    let el = document.getElementById('__dbg');
    if (el) return el;
    el = document.createElement('div');
    el.id = '__dbg';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45%;overflow:auto;' +
      'background:rgba(0,0,0,.85);color:#0f0;font:12px/1.4 monospace;z-index:999999;padding:8px;white-space:pre-wrap';
    document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(el));
    return el;
  }
  function log(type,msg,src,lin,col,stack){
    const el = box();
    const time = new Date().toISOString().slice(11,19);
    const head = `[${time}] ${type}`;
    const loc  = src ? ` @ ${src}:${lin||'?'}:${col||'?'}` : '';
    el.textContent += `${head}${loc}\n${msg || ''}\n${stack ? stack+'\n' : ''}---\n`;
  }
  const origErr = console.error.bind(console);
  console.error = (...a)=>{ try{ log('console.error', a.join(' ')); }catch{} origErr(...a); };
  window.addEventListener('error', e=>{
    log('window.onerror', e.message, e.filename, e.lineno, e.colno, (e.error && e.error.stack)||'');
  });
  window.addEventListener('unhandledrejection', e=>{
    const r = e.reason;
    const msg = (r && (r.stack||r.message)) || String(r);
    log('unhandledrejection', msg);
  });
})();
