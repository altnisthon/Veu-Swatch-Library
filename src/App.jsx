import { useState, useRef, useEffect, useCallback } from "react";

const SEASONS = [
  'Spring Light','Spring Bright',
  'Summer Light','Summer Mute',
  'Autumn Mute','Autumn Deep',
  'Winter Bright','Winter Dark'
];

const SM = {
  'Spring Light':  { dot:'#EDB49A', bg:'#FFF7F3', label:'#A05838', border:'#F5D8CB' },
  'Spring Bright': { dot:'#FF7B5A', bg:'#FFF2ED', label:'#C03A18', border:'#FFCABD' },
  'Summer Light':  { dot:'#C4B2DC', bg:'#F8F4FF', label:'#624898', border:'#DDD0F0' },
  'Summer Mute':   { dot:'#9898BC', bg:'#EEEEFC', label:'#383878', border:'#CACAE8' },
  'Autumn Mute':   { dot:'#C48C58', bg:'#FEF6EA', label:'#7A4818', border:'#EDD0A8' },
  'Autumn Deep':   { dot:'#8B3228', bg:'#FEEEEC', label:'#8B3228', border:'#EDBBBB' },
  'Winter Bright': { dot:'#4060CC', bg:'#EEF0FF', label:'#1828A0', border:'#B8C4F0' },
  'Winter Dark':   { dot:'#20205C', bg:'#EAEAF8', label:'#20205C', border:'#B8B8DC' },
};

const PRODUCT_TYPES = ['Eye', 'Blush', 'Lip'];

const PT = {
  Eye:   { bg: '#EEF0F8', label: '#38489A', border: '#C8CCE8', icon: '👁' },
  Blush: { bg: '#FFF0F5', label: '#B83868', border: '#F0C0D4', icon: '🌸' },
  Lip:   { bg: '#FFF0EE', label: '#B83018', border: '#EDBEBC', icon: '💋' },
};

// ─── Colour Science (client-side fallback) ────────────────
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return rgbToHsl(r, g, b);
}

function suggestSeasonLocal(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 'Autumn Mute';
  const [h, s, l] = hexToHsl(hex);
  const chroma = (s / 100) * (1 - Math.abs(2 * l / 100 - 1));
  const warm   = h <= 50 || h >= 330;
  const light  = l >= 62;
  const dark   = l <= 38;
  const bright = chroma >= 0.35;
  if (warm) {
    if (light) return bright ? 'Spring Bright' : 'Spring Light';
    if (dark)  return 'Autumn Deep';
    return bright ? 'Spring Bright' : 'Autumn Mute';
  } else {
    if (light) return 'Summer Light';
    if (dark)  return bright ? 'Winter Dark' : 'Summer Mute';
    return bright ? 'Winter Bright' : 'Summer Mute';
  }
}

function extractHex(data) {
  let rS = 0, gS = 0, bS = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 128) continue;
    if (r > 238 && g > 238 && b > 238) continue;
    if (r < 18  && g < 18  && b < 18)  continue;
    rS += r; gS += g; bS += b; n++;
  }
  if (!n) return '#888888';
  const h = v => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2,'0');
  return `#${h(rS/n)}${h(gS/n)}${h(bS/n)}`;
}

function processFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = e => {
      const img = new Image();
      img.onload = () => {
        const cw = Math.min(img.width, 400);
        const ch = Math.min(img.height, 400);
        const c  = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        const hex = extractHex(ctx.getImageData(0,0,cw,ch).data);
        const t  = document.createElement('canvas');
        const sc = Math.min(160/img.width, 160/img.height, 1);
        t.width  = Math.round(img.width  * sc);
        t.height = Math.round(img.height * sc);
        t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
        res({ hex, thumb: t.toDataURL('image/jpeg', 0.55) });
      };
      img.onerror = rej;
      img.src = e.target.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

// ─── Upstash storage (shared across all users) ───────────
async function loadSwatches() {
  const res = await fetch('/api/swatches-get');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

async function saveSwatches(swatches) {
  const res = await fetch('/api/swatches-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ swatches }),
  });
  if (!res.ok) throw new Error('Failed to save');
}

// ─── Claude API call ─────────────────────────────────────
async function analyseWithClaude(hex, productType) {
  const hsl = hexToHsl(hex);
  const res = await fetch('/api/analyse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hex, hsl, productType }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ─── Shared styles ────────────────────────────────────────
const BASE_INPUT = {
  width: '100%', border: '1px solid #EDE8E0', borderRadius: 6,
  padding: '9px 12px', fontSize: 12, boxSizing: 'border-box',
  outline: 'none', color: '#333', fontFamily: 'inherit', background: '#fff',
};

function Label({ children }) {
  return (
    <div style={{ fontSize: 9.5, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#B0A8A0', marginBottom: 6, fontWeight: 700 }}>
      {children}
    </div>
  );
}

function emptyForm() {
  return {
    thumb: null, hex: '', brand: '', shade: '', productType: '',
    sugg: '', season: '', busy: false,
    aiAnalysis: null, aiLoading: false, aiError: null,
  };
}

// ─── Main App ────────────────────────────────────────────
export default function App() {
  const [tab,        setTab]        = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sw,         setSw]         = useState([]);
  const [ready,      setReady]      = useState(false);
  const [saveError,  setSaveError]  = useState(null);
  const [open,       setOpen]       = useState(false);
  const [editId,     setEditId]     = useState(null);
  const [form,       setForm]       = useState(emptyForm());
  const [delConfirm, setDelConfirm] = useState(null);
  const fileRef = useRef();

  function formFromEntry(e) {
    return {
      thumb: e.thumb, hex: e.hex, brand: e.brand, shade: e.shade,
      productType: e.productType || '', sugg: suggestSeasonLocal(e.hex),
      season: e.season, busy: false,
      aiAnalysis: e.aiAnalysis || null, aiLoading: false, aiError: null,
    };
  }

  const openEdit = entry => {
    setForm(formFromEntry(entry));
    setEditId(entry.id);
    setOpen(true);
  };

  // Load fonts
  useEffect(() => {
    const l = document.createElement('link');
    l.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap';
    l.rel = 'stylesheet';
    document.head.appendChild(l);
  }, []);

  // Load swatches from Upstash on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await loadSwatches();
        if (Array.isArray(data)) setSw(data);
      } catch (err) {
        console.error('Load error:', err);
      }
      setReady(true);
    })();
  }, []);

  // Poll for changes every 10 seconds so both users stay in sync
  useEffect(() => {
    const interval = setInterval(async () => {
      // Only poll when modal is closed to avoid disrupting edits
      if (open) return;
      try {
        const data = await loadSwatches();
        if (Array.isArray(data)) setSw(data);
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [open]);

  const persist = async list => {
    try {
      setSaveError(null);
      await saveSwatches(list);
    } catch {
      setSaveError('Changes may not have saved. Check your connection.');
    }
  };

  // File upload: extract hex → local suggestion → call Claude
  const handleFile = async file => {
    if (!file) return;
    setForm(f => ({ ...f, busy: true, thumb: null, hex: '', sugg: '', season: '', aiAnalysis: null, aiError: null }));
    try {
      const { hex, thumb } = await processFile(file);
      const sugg = suggestSeasonLocal(hex);
      setForm(f => ({ ...f, thumb, hex, sugg, season: sugg, busy: false, aiLoading: true }));
      try {
        const ai = await analyseWithClaude(hex, form.productType);
        setForm(f => ({
          ...f,
          aiAnalysis: ai,
          season: ai.season || f.season,
          sugg: ai.season || f.sugg,
          aiLoading: false,
        }));
      } catch {
        setForm(f => ({ ...f, aiLoading: false, aiError: 'Could not reach analysis. Season suggestion is based on colour values.' }));
      }
    } catch {
      setForm(f => ({ ...f, busy: false }));
    }
  };

  const handleHexChange = useCallback(val => {
    setForm(f => ({
      ...f, hex: val,
      ...(/^#[0-9a-fA-F]{6}$/.test(val) ? { sugg: suggestSeasonLocal(val), season: suggestSeasonLocal(val) } : {}),
      aiAnalysis: null, aiError: null,
    }));
  }, []);

  // Re-run Claude when hex is manually edited and focus leaves the field
  const handleHexBlur = async () => {
    const { hex, productType } = form;
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    setForm(f => ({ ...f, aiLoading: true, aiError: null }));
    try {
      const ai = await analyseWithClaude(hex, productType);
      setForm(f => ({
        ...f,
        aiAnalysis: ai,
        season: ai.season || f.season,
        sugg: ai.season || f.sugg,
        aiLoading: false,
      }));
    } catch {
      setForm(f => ({ ...f, aiLoading: false, aiError: 'Analysis unavailable. Using colour math suggestion.' }));
    }
  };

  const handleSave = async () => {
    const { thumb, hex, brand, shade, productType, season, aiAnalysis } = form;
    if (!thumb || !/^#[0-9a-fA-F]{6}$/.test(hex) || !brand.trim() || !shade.trim() || !season || !productType) return;
    let next;
    if (editId) {
      next = sw.map(x => x.id === editId
        ? { ...x, thumb, hex, brand: brand.trim(), shade: shade.trim(), productType, season, aiAnalysis }
        : x
      );
    } else {
      const entry = {
        id: Date.now().toString(), thumb, hex,
        brand: brand.trim(), shade: shade.trim(),
        productType, season, aiAnalysis, ts: Date.now(),
      };
      next = [...sw, entry];
    }
    setSw(next);
    await persist(next);
    if (!editId) setTab(season);
    closeModal();
  };

  const closeModal = () => { setOpen(false); setEditId(null); setForm(emptyForm()); };

  const handleDelete = async id => {
    const next = sw.filter(x => x.id !== id);
    setSw(next);
    await persist(next);
    setDelConfirm(null);
  };

  const byTab = tab === 'All' ? sw : sw.filter(x => x.season === tab);
  const vis   = typeFilter === 'All' ? byTab : byTab.filter(x => x.productType === typeFilter);
  const ct    = t => t === 'All' ? sw.length : sw.filter(x => x.season === t).length;
  const tct   = t => t === 'All' ? byTab.length : byTab.filter(x => x.productType === t).length;
  const canSave = form.thumb && /^#[0-9a-fA-F]{6}$/.test(form.hex) && form.brand.trim() && form.shade.trim() && form.season && form.productType;

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", minHeight: '100vh', background: '#FDFAF7', color: '#1a1a1a' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EDE8E0', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 19, letterSpacing: '0.2em', color: '#932D28', fontWeight: 300, lineHeight: 1 }}>
            VEU ALCHEMIST
          </div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', color: '#C0B8B0', textTransform: 'uppercase', marginTop: 3 }}>
            Colour Swatch Library
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 10, color: '#C0B8B0', letterSpacing: '0.08em' }}>
            {sw.length} {sw.length === 1 ? 'swatch' : 'swatches'}
          </div>
          <button
            onClick={() => setOpen(true)}
            style={{ background: '#932D28', color: '#fff', border: 'none', borderRadius: 4, padding: '9px 16px', fontSize: 10, letterSpacing: '0.12em', cursor: 'pointer', textTransform: 'uppercase', fontWeight: 700, fontFamily: 'inherit' }}
          >
            + Add Swatch
          </button>
        </div>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA', padding: '8px 22px', fontSize: 10, color: '#991B1B', letterSpacing: '0.04em' }}>
          ⚠ {saveError}
        </div>
      )}

      {/* Season Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EDE8E0', display: 'flex', overflowX: 'auto', padding: '0 14px', scrollbarWidth: 'none' }}>
        {['All', ...SEASONS].map(t => (
          <button key={t} onClick={() => { setTab(t); setTypeFilter('All'); }} style={{
            background: 'none', border: 'none',
            borderBottom: tab === t ? '2px solid #932D28' : '2px solid transparent',
            padding: '11px 12px', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer', whiteSpace: 'nowrap',
            color: tab === t ? '#932D28' : '#A0988F',
            fontWeight: tab === t ? 700 : 400,
            transition: 'all 0.2s', fontFamily: 'inherit',
          }}>
            {t} <span style={{ opacity: 0.6 }}>({ct(t)})</span>
          </button>
        ))}
      </div>

      {/* Product Type Filter */}
      <div style={{ background: '#FAF7F4', borderBottom: '1px solid #EDE8E0', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C0B8B0', fontWeight: 700, marginRight: 4 }}>Type</span>
        {['All', ...PRODUCT_TYPES].map(t => {
          const active = typeFilter === t;
          const pt = PT[t];
          return (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              background: active ? (pt ? pt.bg : '#932D28') : 'transparent',
              color: active ? (pt ? pt.label : '#fff') : '#A09890',
              border: active ? `1px solid ${pt ? pt.border : '#932D28'}` : '1px solid #EDE8E0',
              borderRadius: 20, padding: '4px 12px', fontSize: 10, letterSpacing: '0.08em',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 700 : 400,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>
              {pt ? `${pt.icon} ${t}` : `All (${tct('All')})`}
              {t !== 'All' && ` (${tct(t)})`}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 14 }}>
        {!ready ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: '#CCC', fontSize: 12, letterSpacing: '0.08em' }}>
            Loading library...
          </div>
        ) : vis.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 20px', color: '#C8C0B8' }}>
            <div style={{ fontSize: 34, marginBottom: 14 }}>🎨</div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', lineHeight: 2 }}>
              {tab === 'All' && typeFilter === 'All'
                ? <><span style={{ display: 'block' }}>Your library is empty.</span><span style={{ color: '#932D28', fontWeight: 600 }}>+ Add Swatch</span> to begin.</>
                : typeFilter !== 'All'
                  ? <><span style={{ display: 'block', fontWeight: 600 }}>{PT[typeFilter]?.icon} {typeFilter}</span><span>No swatches{tab !== 'All' ? ` for ${tab}` : ''} yet.</span></>
                  : <><span style={{ display: 'block' }}>No swatches for</span><span style={{ fontWeight: 600, color: SM[tab]?.label }}>{tab}</span> yet.</>
              }
            </div>
          </div>
        ) : vis.map(s => (
          <SwatchCard key={s.id} s={s} onDelete={id => setDelConfirm(id)} onEdit={openEdit} />
        ))}
      </div>

      {/* Add/Edit Modal */}
      {open && (
        <Modal
          form={form} setForm={setForm}
          fileRef={fileRef}
          onFile={handleFile}
          onHexChange={handleHexChange}
          onHexBlur={handleHexBlur}
          onSave={handleSave}
          canSave={!!canSave}
          isEditing={!!editId}
          onClose={closeModal}
        />
      )}

      {/* Delete Confirm */}
      {delConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '24px 28px', maxWidth: 300, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Remove swatch?</div>
            <div style={{ fontSize: 11, color: '#AAA', marginBottom: 20, letterSpacing: '0.04em' }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDelConfirm(null)} style={{ flex: 1, background: '#F5F0EB', border: 'none', borderRadius: 6, padding: '10px 0', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#888' }}>Cancel</button>
              <button onClick={() => handleDelete(delConfirm)} style={{ flex: 1, background: '#932D28', border: 'none', borderRadius: 6, padding: '10px 0', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#fff' }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Swatch Card ─────────────────────────────────────────
function SwatchCard({ s, onDelete, onEdit }) {
  const m  = SM[s.season] || SM['Autumn Mute'];
  const ai = s.aiAnalysis;

  return (
    <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', position: 'relative', border: '1px solid #F0EBE5' }}>
      <div style={{ width: '100%', aspectRatio: '1', background: '#F8F4F0', overflow: 'hidden' }}>
        <img src={s.thumb} alt={s.shade} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
        <button onClick={() => onEdit(s)} title="Edit" style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.88)', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>✏︎</button>
        <button onClick={() => onDelete(s.id)} title="Delete" style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.32)', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, fontWeight: 300 }}>×</button>
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: s.hex, border: '1.5px solid rgba(0,0,0,0.08)', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }} />
            <span style={{ fontSize: 9, color: '#C0B8B0', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{s.hex.toUpperCase()}</span>
          </div>
          {s.productType && PT[s.productType] && (
            <span style={{ background: PT[s.productType].bg, color: PT[s.productType].label, border: `1px solid ${PT[s.productType].border}`, fontSize: 8.5, padding: '2px 7px', borderRadius: 10, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              {PT[s.productType].icon} {s.productType}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, letterSpacing: '0.04em', lineHeight: 1.3, color: '#1a1a1a' }}>{s.brand}</div>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 9, lineHeight: 1.4 }}>{s.shade}</div>
        <div style={{ background: m.bg, color: m.label, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 3, fontWeight: 700, display: 'inline-block', border: `1px solid ${m.border}` }}>
          {s.season}
        </div>
        {ai && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #F0EBE5' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {ai.undertone && <span style={{ fontSize: 7.5, background: '#FFF7F3', color: '#A05838', border: '1px solid #F5D8CB', borderRadius: 10, padding: '2px 6px', fontWeight: 700, letterSpacing: '0.06em' }}>{ai.undertone}</span>}
              {ai.value    && <span style={{ fontSize: 7.5, background: '#F5F5F5', color: '#666', border: '1px solid #E8E8E8', borderRadius: 10, padding: '2px 6px', fontWeight: 700, letterSpacing: '0.06em' }}>{ai.value}</span>}
              {ai.chroma   && <span style={{ fontSize: 7.5, background: '#F5F5F5', color: '#666', border: '1px solid #E8E8E8', borderRadius: 10, padding: '2px 6px', fontWeight: 700, letterSpacing: '0.06em' }}>{ai.chroma}</span>}
            </div>
            {ai.why && <p style={{ fontSize: 9, color: '#888', lineHeight: 1.55, margin: '0 0 4px', letterSpacing: '0.01em' }}>{ai.why}</p>}
            {ai.tip && <p style={{ fontSize: 9, color: '#932D28', lineHeight: 1.55, margin: 0, fontStyle: 'italic', letterSpacing: '0.01em' }}>✦ {ai.tip}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add/Edit Modal ───────────────────────────────────────
function Modal({ form, setForm, fileRef, onFile, onHexChange, onHexBlur, onSave, canSave, isEditing, onClose }) {
  const { thumb, hex, brand, shade, productType, sugg, season, busy, aiAnalysis, aiLoading, aiError } = form;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 390, maxHeight: '92vh', overflowY: 'auto', padding: '24px 24px 28px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#932D28', fontWeight: 400, letterSpacing: '0.05em' }}>
            {isEditing ? 'Edit Swatch' : 'Add Swatch'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#C8C0B8', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Upload zone */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${thumb ? '#EDE8E0' : '#D75C61'}`,
            borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer', marginBottom: 18,
            background: '#FDFAF7', minHeight: 120, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative',
          }}
        >
          {thumb ? (
            <>
              <img src={thumb} alt="preview" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }} />
              <div style={{ fontSize: 9.5, color: '#C0B8B0', letterSpacing: '0.06em', marginTop: 2 }}>Tap to replace photo</div>
            </>
          ) : busy ? (
            <div style={{ color: '#C8C0B8', fontSize: 11, letterSpacing: '0.08em' }}>Extracting colour...</div>
          ) : (
            <>
              <div style={{ fontSize: 28 }}>📷</div>
              <div style={{ fontSize: 11, color: '#C8C0B8', letterSpacing: '0.06em' }}>Tap to upload product screenshot</div>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
        </div>

        {thumb && <>
          {/* Hex */}
          <div style={{ marginBottom: 14 }}>
            <Label>Extracted Colour</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: hex, border: '2px solid #EDE8E0', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }} />
              <input
                value={hex}
                onChange={e => onHexChange(e.target.value)}
                onBlur={onHexBlur}
                style={{ ...BASE_INPUT, fontFamily: 'monospace', flex: 1 }}
                placeholder="#rrggbb"
              />
            </div>
          </div>

          {/* AI Analysis panel */}
          <div style={{ marginBottom: 14 }}>
            {aiLoading && (
              <div style={{ background: '#FFF7F3', border: '1px solid #F5D8CB', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 16, height: 16, border: '2px solid #F5D8CB', borderTopColor: '#932D28', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#A05838', letterSpacing: '0.06em' }}>Analysing shade with Claude...</span>
              </div>
            )}

            {aiError && !aiLoading && (
              <div style={{ background: '#FFF7F3', border: '1px solid #F5D8CB', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 9.5, color: '#A05838', letterSpacing: '0.04em' }}>{aiError}</div>
              </div>
            )}

            {aiAnalysis && !aiLoading && (
              <div style={{ background: SM[aiAnalysis.season]?.bg || '#FFF', borderRadius: 8, padding: '12px 14px', border: `1px solid ${SM[aiAnalysis.season]?.border || '#EDE8E0'}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: SM[aiAnalysis.season]?.dot, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B0A8A0', marginBottom: 3 }}>Claude Analysis</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: SM[aiAnalysis.season]?.label || '#333', letterSpacing: '0.04em', marginBottom: 6 }}>
                      {aiAnalysis.season}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                      {aiAnalysis.undertone && <span style={{ fontSize: 8.5, background: 'rgba(255,255,255,0.7)', color: SM[aiAnalysis.season]?.label || '#666', border: `1px solid ${SM[aiAnalysis.season]?.border || '#EDE8E0'}`, borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>{aiAnalysis.undertone}</span>}
                      {aiAnalysis.value    && <span style={{ fontSize: 8.5, background: 'rgba(255,255,255,0.7)', color: '#888', border: '1px solid #E8E8E8', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>{aiAnalysis.value}</span>}
                      {aiAnalysis.chroma   && <span style={{ fontSize: 8.5, background: 'rgba(255,255,255,0.7)', color: '#888', border: '1px solid #E8E8E8', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>{aiAnalysis.chroma}</span>}
                    </div>
                    {aiAnalysis.why && <p style={{ fontSize: 10, color: SM[aiAnalysis.season]?.label || '#666', opacity: 0.85, lineHeight: 1.55, margin: '0 0 6px', letterSpacing: '0.01em' }}>{aiAnalysis.why}</p>}
                    {aiAnalysis.tip && <p style={{ fontSize: 10, color: '#932D28', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>✦ {aiAnalysis.tip}</p>}
                  </div>
                </div>
              </div>
            )}

            {!aiAnalysis && !aiLoading && sugg && (
              <div style={{ background: SM[sugg]?.bg || '#FFF', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${SM[sugg]?.border || '#EDE8E0'}` }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: SM[sugg]?.dot, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B0A8A0', marginBottom: 3 }}>Suggested Season</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: SM[sugg]?.label || '#333', letterSpacing: '0.04em' }}>{sugg}</div>
                </div>
              </div>
            )}
          </div>

          {/* Season override */}
          <div style={{ marginBottom: 16 }}>
            <Label>Assign Season</Label>
            <select value={season} onChange={e => setForm(f => ({ ...f, season: e.target.value }))} style={{ ...BASE_INPUT }}>
              {SEASONS.map(s => (
                <option key={s} value={s}>{s}{s === (aiAnalysis?.season || sugg) ? ' — suggested' : ''}</option>
              ))}
            </select>
          </div>
        </>}

        {/* Brand */}
        <div style={{ marginBottom: 12 }}>
          <Label>Brand</Label>
          <input value={brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} style={BASE_INPUT} placeholder="e.g. ROMAND" />
        </div>

        {/* Shade */}
        <div style={{ marginBottom: 16 }}>
          <Label>Shade</Label>
          <input value={shade} onChange={e => setForm(f => ({ ...f, shade: e.target.value }))} style={BASE_INPUT} placeholder="e.g. Dry Miso Rose" />
        </div>

        {/* Product Type */}
        <div style={{ marginBottom: 22 }}>
          <Label>Product Type</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {PRODUCT_TYPES.map(t => {
              const active = productType === t;
              return (
                <button key={t} onClick={() => setForm(f => ({ ...f, productType: t }))} style={{
                  flex: 1, background: active ? PT[t].bg : '#FDFAF7',
                  color: active ? PT[t].label : '#A09890',
                  border: active ? `1.5px solid ${PT[t].border}` : '1.5px solid #EDE8E0',
                  borderRadius: 8, padding: '10px 0', fontSize: 11, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: active ? 700 : 400, transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                }}>
                  <span style={{ fontSize: 16 }}>{PT[t].icon}</span>
                  <span style={{ letterSpacing: '0.06em', fontSize: 10 }}>{t}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={onSave} disabled={!canSave}
          style={{ width: '100%', background: canSave ? '#932D28' : '#EDE8E0', color: canSave ? '#fff' : '#C8C0B8', border: 'none', borderRadius: 6, padding: '12px 0', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: canSave ? 'pointer' : 'not-allowed', fontWeight: 700, transition: 'background 0.2s', fontFamily: 'inherit' }}
        >
          {isEditing ? 'Save Changes' : 'Save to Library'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
