/* Race Team OS (Front-end prototype)
 * Shared utilities: safe storage, nav activation, tri-pane resizers.
 * Works in file:// contexts.
 */

(function(){
  function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }

  function deepMerge(target, source){
    const out = Array.isArray(target) ? target.slice() : (isObj(target) ? {...target} : {});
    if (!isObj(source) && !Array.isArray(source)) return out;
    const keys = Array.isArray(source) ? Object.keys(source) : Object.keys(source);
    for (const k of keys){
      const sv = source[k];
      const tv = out[k];
      if (isObj(sv) && isObj(tv)) out[k] = deepMerge(tv, sv);
      else out[k] = sv;
    }
    return out;
  }

  function safeParseJSON(str, fallback){
    try {
      const v = JSON.parse(str);
      return (v === null || v === undefined) ? fallback : v;
    } catch(_e){
      return fallback;
    }
  }

  function safeGetItem(key){
    try { return window.localStorage.getItem(key); } catch(_e){ return null; }
  }

  function safeSetItem(key, value){
    try { window.localStorage.setItem(key, value); } catch(_e){ /* ignore */ }
  }

  function safeRemoveItem(key){
    try { window.localStorage.removeItem(key); } catch(_e){ /* ignore */ }
  }

  function safeLoadJSON(key, fallback){
    const raw = safeGetItem(key);
    if (!raw) return fallback;
    return safeParseJSON(raw, fallback);
  }

  function safeSaveJSON(key, obj){
    safeSetItem(key, JSON.stringify(obj));
  }

  function setActiveNav(){
    const page = (location.pathname.split('/').pop() || '').toLowerCase();
    document.querySelectorAll('.sidebar .nav-link').forEach(a => {
      a.classList.remove('active');
      const href = (a.getAttribute('href')||'').toLowerCase();
      if (href === page) a.classList.add('active');
    });
  }

  function initTriPaneResizers(shellEl, storeKey){
    if (!shellEl) return;
    const left = shellEl.querySelector('.mlo-pane-left');
    const right = shellEl.querySelector('.mlo-pane-right');
    const resizers = shellEl.querySelectorAll('.mlo-resizer');
    const minLeft = 180;
    const minRight = 280;

    // restore widths
    const saved = safeLoadJSON(storeKey, null);
    if (saved && left && typeof saved.left === 'number') left.style.width = saved.left + 'px';
    if (saved && right && typeof saved.right === 'number') right.style.width = saved.right + 'px';

    function persist(){
      if (!left || !right) return;
      safeSaveJSON(storeKey, {
        left: Math.round(left.getBoundingClientRect().width),
        right: Math.round(right.getBoundingClientRect().width)
      });
    }

    resizers.forEach(rz => {
      const side = rz.getAttribute('data-resize');
      let startX = 0;
      let startLeft = 0;
      let startRight = 0;

      function onMove(e){
        const dx = e.clientX - startX;
        if (side === 'left' && left){
          const w = Math.max(minLeft, startLeft + dx);
          left.style.width = w + 'px';
        }
        if (side === 'right' && right){
          const w = Math.max(minRight, startRight - dx);
          right.style.width = w + 'px';
        }
      }

      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persist();
      }

      rz.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        if (left) startLeft = left.getBoundingClientRect().width;
        if (right) startRight = right.getBoundingClientRect().width;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  function moneyZAR(n){
    const v = (typeof n === 'number') ? n : parseFloat(n || 0);
    return 'R' + (isNaN(v) ? '0.00' : v.toFixed(2));
  }

  // Export
  window.RTS = {
    deepMerge,
    safeLoadJSON,
    safeSaveJSON,
    safeRemoveItem,
    setActiveNav,
    initTriPaneResizers,
    moneyZAR
  };
})();
