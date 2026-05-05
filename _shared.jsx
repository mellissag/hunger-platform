// All screens in Magazine Light style — Hunger Beauty + iOS 26 Liquid Glass
// Each screen is a function returning a phone-content component (390×844 frame).

// ──────────────────────────────────────────────────────────────
// Shared chrome helpers for this style system
// ──────────────────────────────────────────────────────────────

function MLBackground({ children, variant = 'ivory' }) {
  const bgs = {
    ivory: `
      radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.12), transparent 50%),
      radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%),
      ${IVORY}`,
    soft: `
      radial-gradient(ellipse at 50% 0%, rgba(201,168,76,.18), transparent 60%),
      ${IVORY}`,
    dark: `
      radial-gradient(ellipse at 50% 30%, rgba(201,168,76,.30), transparent 60%),
      linear-gradient(180deg, #1a1408 0%, #060604 100%)`
  };
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: bgs[variant]
    }}>{children}</div>
  );
}

// Standard top bar — back chev or wordmark left, action right
function MLTopBar({ left, right, variant = 'light' }) {
  const fg = variant === 'dark' ? '#F0EBE0' : NEAR_BLACK;
  return (
    <div style={{
      padding: '10px 16px', display: 'flex',
      justifyContent: 'space-between', alignItems: 'center',
      gap: 8, color: fg
    }}>
      {left || <div/>}
      {right || <div/>}
    </div>
  );
}

function MLBackPill({ dark = false, glass = 'med' }) {
  return (
    <Glass dark={dark} intensity={glass} radius={22} style={{ width: 44, height: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: dark ? '#F0EBE0' : NEAR_BLACK }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </Glass>
  );
}

// Magazine-style page title (eyebrow + serif headline)
function MLHeader({ eyebrow, title, italic, subtitle, align = 'left' }) {
  return (
    <div style={{ padding: '8px 28px 18px', textAlign: align }}>
      {eyebrow && (
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.28em',
          color: GOLD_LO, textTransform: 'uppercase'
        }}>{eyebrow}</div>
      )}
      <div style={{
        fontFamily: SERIF_DISP, fontSize: 38, fontWeight: 500,
        color: NEAR_BLACK, lineHeight: 1.0, marginTop: 12,
        letterSpacing: '-0.02em'
      }}>
        {title}{italic && <> <span style={{ fontStyle: 'italic', color: GOLD_LO }}>{italic}</span></>}
        <span style={{ fontFamily: SERIF, color: NEAR_BLACK }}>.</span>
      </div>
      {subtitle && (
        <div style={{
          fontSize: 13, color: '#4A3F2E', lineHeight: 1.5, marginTop: 12,
          maxWidth: 300, marginLeft: align === 'center' ? 'auto' : 0,
          marginRight: align === 'center' ? 'auto' : 0
        }}>{subtitle}</div>
      )}
    </div>
  );
}

// Primary dark pill button
function MLPrimaryBtn({ children, fullWidth = false, icon = true }) {
  return (
    <button style={{
      background: NEAR_BLACK, border: 'none', color: IVORY,
      padding: '14px 22px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.10em',
      textTransform: 'uppercase', fontFamily: BODY,
      display: 'flex', alignItems: 'center', gap: 8,
      justifyContent: 'center',
      width: fullWidth ? '100%' : undefined,
      boxShadow: '0 8px 24px rgba(28,20,9,.18)'
    }}>
      <span>{children}</span>
      {icon && <Icon name="arrow" size={14} stroke={2}/>}
    </button>
  );
}

// Secondary outlined pill button
function MLSecondaryBtn({ children, fullWidth = false }) {
  return (
    <button style={{
      background: 'transparent', border: `1px solid rgba(28,20,9,.2)`,
      color: NEAR_BLACK, padding: '14px 22px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.10em',
      textTransform: 'uppercase', fontFamily: BODY,
      width: fullWidth ? '100%' : undefined
    }}>{children}</button>
  );
}

// Ornament divider
function MLOrnament() {
  return (
    <div style={{
      textAlign: 'center', color: GOLD_LO, opacity: .6,
      letterSpacing: '0.6em', fontSize: 12, padding: '8px 0',
      fontFamily: SERIF
    }}>⸻ ✦ ⸻</div>
  );
}

// SVG-based service "photo" — abstract gold-on-ivory composition (placeholder for real imagery)
function ServicePhoto({ seed = 0, height = 200, dark = false }) {
  const palettes = [
    { a: '#EDE5D5', b: '#D9C8A4', c: GOLD_LO },
    { a: '#E4DDD0', b: '#C9B68A', c: '#7A5A1F' },
    { a: '#F0E8D8', b: '#E0CF6A', c: '#9A7230' },
    { a: '#1C1408', b: '#3A2E1C', c: GOLD },
    { a: '#2A1F12', b: '#4A3F2E', c: GOLD_HI },
    { a: '#F5EFE0', b: '#C9A84C', c: '#6F5020' }
  ];
  const p = palettes[seed % palettes.length];
  return (
    <div style={{
      width: '100%', height, borderRadius: 22, overflow: 'hidden',
      position: 'relative',
      background: `linear-gradient(135deg, ${p.a} 0%, ${p.b} 100%)`
    }}>
      <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0 }}>
        {seed % 3 === 0 && (
          <>
            <circle cx="320" cy="60" r="80" fill={p.c} opacity="0.25"/>
            <circle cx="80" cy="180" r="120" fill={p.c} opacity="0.18"/>
            <path d="M0,120 Q100,80 200,110 T400,90 L400,200 L0,200 Z" fill={p.c} opacity="0.2"/>
          </>
        )}
        {seed % 3 === 1 && (
          <>
            <ellipse cx="200" cy="100" rx="180" ry="60" fill={p.c} opacity="0.15"/>
            <path d="M50,40 Q150,20 250,60 T380,40" stroke={p.c} strokeWidth="1.5" fill="none" opacity="0.5"/>
            <path d="M30,90 Q130,70 230,110 T380,90" stroke={p.c} strokeWidth="1" fill="none" opacity="0.4"/>
            <path d="M20,140 Q120,120 220,160 T380,140" stroke={p.c} strokeWidth="1" fill="none" opacity="0.3"/>
            <circle cx="340" cy="50" r="40" fill={p.c} opacity="0.2"/>
          </>
        )}
        {seed % 3 === 2 && (
          <>
            <rect x="20" y="40" width="140" height="120" fill={p.c} opacity="0.2"/>
            <rect x="180" y="20" width="100" height="160" fill={p.c} opacity="0.15"/>
            <rect x="300" y="60" width="80" height="80" fill={p.c} opacity="0.25"/>
            <line x1="0" y1="180" x2="400" y2="180" stroke={p.c} strokeWidth="2" opacity="0.4"/>
          </>
        )}
      </svg>
    </div>
  );
}

window.MLBackground = MLBackground;
window.MLTopBar = MLTopBar;
window.MLBackPill = MLBackPill;
window.MLHeader = MLHeader;
window.MLPrimaryBtn = MLPrimaryBtn;
window.MLSecondaryBtn = MLSecondaryBtn;
window.MLOrnament = MLOrnament;
window.ServicePhoto = ServicePhoto;
