// Screen primitives — shared across all flow screens
// Magazine-light Hunger style with iOS 26 floating tab bar

// Background — luxe ivory with subtle gold radial
function ScreenBg({ children }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `
        radial-gradient(ellipse at 100% 0%, rgba(201,168,76,.10), transparent 50%),
        radial-gradient(ellipse at 0% 100%, rgba(237,229,213,.5), transparent 50%),
        ${IVORY}`,
      color: NEAR_BLACK, fontFamily: BODY,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

// Top app bar — minimal, with optional back/title/trailing
function AppBar({ title, back = false, trailing, glass = 'med' }) {
  return (
    <div style={{
      padding: '70px 16px 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10,
    }}>
      {back ? (
        <Glass dark={false} intensity={glass} radius={22} style={{ width: 44, height: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: NEAR_BLACK }}>
            <svg width="14" height="22" viewBox="0 0 14 22"><path d="M11 2L3 11l8 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </Glass>
      ) : <div style={{ width: 44 }}/>}
      <div style={{
        flex: 1, textAlign: 'center',
        fontFamily: SERIF_DISP, fontSize: 15, fontWeight: 500,
        color: NEAR_BLACK, letterSpacing: '0.02em',
      }}>{title}</div>
      <div style={{ width: 44, display: 'flex', justifyContent: 'flex-end' }}>
        {trailing || <div style={{ width: 44 }}/>}
      </div>
    </div>
  );
}

// Section header with eyebrow + serif title + accent italic
function SectionHeader({ eyebrow, title, italic, trailing }) {
  return (
    <div style={{
      padding: '18px 22px 10px',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14,
    }}>
      <div>
        {eyebrow && <Eyebrow color={GOLD_LO} style={{ marginBottom: 6 }}>{eyebrow}</Eyebrow>}
        <div style={{
          fontFamily: SERIF_DISP, fontSize: 22, fontWeight: 500,
          color: NEAR_BLACK, letterSpacing: '-0.01em', lineHeight: 1.1,
        }}>
          {title}
          {italic && <> <span style={{ fontStyle: 'italic', color: GOLD_LO }}>{italic}</span></>}
        </div>
      </div>
      {trailing}
    </div>
  );
}

// Reusable primary CTA button — pill, near-black bg
function PrimaryCTA({ children, full = false, gold = false, style = {} }) {
  return (
    <button style={{
      background: gold ? `linear-gradient(135deg, ${GOLD_LO}, ${GOLD_HI})` : NEAR_BLACK,
      border: 'none', color: gold ? '#fff' : IVORY,
      padding: '16px 22px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.10em',
      textTransform: 'uppercase', fontFamily: BODY,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      width: full ? '100%' : 'auto',
      boxShadow: gold ? '0 8px 24px rgba(154,114,48,.35)' : '0 8px 24px rgba(28,20,9,.18)',
      cursor: 'pointer',
      ...style,
    }}>{children}</button>
  );
}

// Secondary outlined CTA
function SecondaryCTA({ children, full = false, style = {} }) {
  return (
    <button style={{
      background: 'transparent', border: `1px solid rgba(28,20,9,.2)`,
      color: NEAR_BLACK, padding: '16px 22px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.10em',
      textTransform: 'uppercase', fontFamily: BODY,
      width: full ? '100%' : 'auto',
      cursor: 'pointer',
      ...style,
    }}>{children}</button>
  );
}

// Decorative ornament divider
function Ornament() {
  return (
    <div style={{
      textAlign: 'center', color: GOLD_LO, opacity: .55,
      letterSpacing: '0.6em', fontSize: 12, padding: '8px 0',
      fontFamily: SERIF,
    }}>⸻ ✦ ⸻</div>
  );
}

// Generic placeholder image — gold gradient + monogram
// Used for service photos since we don't have stock imagery
function PlaceholderImage({ initials = '∗', height = 160, radius = 22, dark = false, label }) {
  // Each placeholder gets a slightly different gradient direction based on initials
  const seed = (initials.charCodeAt(0) || 0) % 4;
  const gradients = [
    `linear-gradient(135deg, #2a1f12, #4a3825 50%, ${GOLD_LO} 130%)`,
    `linear-gradient(160deg, #1a1408, ${GOLD_DEEP} 60%, ${GOLD} 120%)`,
    `linear-gradient(195deg, #efe6d2, ${GOLD_HI} 70%, ${GOLD_LO} 130%)`,
    `linear-gradient(135deg, ${GOLD_DEEP}, #2a1f12 50%, #1a1408 100%)`,
  ];
  const isLight = seed === 2;
  return (
    <div style={{
      height, width: '100%', borderRadius: radius,
      background: gradients[seed], position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(28,20,9,.12), 0 0 0 1px rgba(154,114,48,.18)',
    }}>
      {/* radial bloom */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at ${20 + seed * 20}% ${30 + seed * 15}%, rgba(255,255,255,.18), transparent 60%)`,
      }}/>
      {/* gold stripe top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
      }}/>
      {/* monogram center */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: SERIF, fontStyle: 'italic',
        fontSize: Math.min(72, height * 0.5), fontWeight: 500,
        color: isLight ? 'rgba(28,20,9,.4)' : 'rgba(240,235,224,.85)',
        letterSpacing: '-0.03em',
      }}>{initials}</div>
      {label && (
        <div style={{
          position: 'absolute', bottom: 14, left: 18,
          fontSize: 9, fontWeight: 600, letterSpacing: '0.22em',
          color: isLight ? 'rgba(28,20,9,.7)' : 'rgba(240,235,224,.85)',
          textTransform: 'uppercase',
        }}>{label}</div>
      )}
    </div>
  );
}

// Status badge pill
function StatusBadge({ kind = 'gold', children }) {
  const colors = {
    gold:  { fg: GOLD_LO, bg: 'rgba(154,114,48,.10)', bd: 'rgba(154,114,48,.3)' },
    ok:    { fg: '#3A7D44', bg: 'rgba(58,125,68,.08)', bd: 'rgba(58,125,68,.3)' },
    warn:  { fg: '#9A6D1A', bg: 'rgba(154,109,26,.08)', bd: 'rgba(154,109,26,.3)' },
    muted: { fg: '#7A6E58', bg: 'rgba(122,110,88,.08)', bd: 'rgba(122,110,88,.25)' },
  }[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
      color: colors.fg, background: colors.bg,
      border: `1px solid ${colors.bd}`,
      padding: '4px 9px', borderRadius: 2,
      textTransform: 'uppercase',
    }}>{children}</span>
  );
}

Object.assign(window, {
  ScreenBg, AppBar, SectionHeader, PrimaryCTA, SecondaryCTA,
  Ornament, PlaceholderImage, StatusBadge,
});
