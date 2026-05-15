'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { fmtTpl } from '../i18n/loyalty';
import { useT } from '../i18n/context';
import { useTheme } from '../providers/ThemeProvider';
import { useMeLoyalty, useMeLoyaltyTransactions } from '../hooks/useLoyalty';

const GOLD = '#C9A84C';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';

function Box({ style, children }: { style?: CSSProperties; children?: ReactNode }) {
  return <div style={style}>{children}</div>;
}

function Eyebrow({ color, children }: { color: string; children: ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color, margin: '0 0 8px' }}>
      {children}
    </p>
  );
}

function Progress({ label, pct, muted }: { label: string; pct: number; muted: string }) {
  return (
    <Box style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dotted rgba(201,168,76,.35)' }}>
      <Box style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8, color: muted }}>
        <span>{label}</span>
        <span style={{ color: GOLD, fontFamily: SERIF }}>{pct}%</span>
      </Box>
      <Box style={{ height: 3, borderRadius: 999, background: 'rgba(201,168,76,.15)', overflow: 'hidden' }}>
        <Box style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${GOLD}, #E0CF6A)` }} />
      </Box>
    </Box>
  );
}

export default function BonusesPage() {
  const { t, lang } = useT();
  const { theme } = useTheme();
  const { data: loyalty, isLoading } = useMeLoyalty();
  const [txLimit, setTxLimit] = useState(10);
  const { data: transactions = [] } = useMeLoyaltyTransactions(txLimit, 0);
  const [copied, setCopied] = useState(false);

  const isDark = theme === 'dark';
  const bg = isDark ? '#0D0D0D' : '#F5F0E8';
  const card: CSSProperties = {
    margin: '12px 16px 0',
    padding: 18,
    borderRadius: 16,
    background: isDark ? '#1A1A1A' : '#FFFFFF',
    border: isDark ? '1px solid rgba(201,168,76,.35)' : '1px solid #E8DFC8',
  };
  const text = isDark ? '#FFFFFF' : '#1A1A1A';
  const muted = isDark ? 'rgba(255,255,255,.45)' : '#8A7D6A';

  const eurValue = useMemo(() => {
    if (!loyalty) return '0.00';
    return (loyalty.points * Number(loyalty.points_value_eur)).toFixed(2);
  }, [loyalty]);

  const referralSubtitle = useMemo(() => {
    if (!loyalty?.referral_enabled) return '';
    const mode = loyalty.referral_reward_mode;
    if (mode === 'both') {
      return fmtTpl(t.loyaltyReferralSubtitleBoth, {
        referrer: loyalty.referral_bonus_referrer,
        invited: loyalty.referral_bonus_invited,
      });
    }
    if (mode === 'referrer_only') {
      return fmtTpl(t.loyaltyReferralSubtitleReferrerOnly, { referrer: loyalty.referral_bonus_referrer });
    }
    return fmtTpl(t.loyaltyReferralSubtitleInvitedOnly, { invited: loyalty.referral_bonus_invited });
  }, [loyalty, t]);

  const progressPct = useMemo(() => {
    if (!loyalty?.next_status_visits_remaining) return 0;
    const rem = loyalty.next_status_visits_remaining;
    return Math.min(100, Math.round((1 / (rem + 1)) * 100));
  }, [loyalty]);

  async function copyCode() {
    if (!loyalty?.referral_code) return;
    try {
      await navigator.clipboard.writeText(loyalty.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function shareLink() {
    const link = loyalty?.referral_link;
    if (!link) return;
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink(link);
    else if (navigator.share) void navigator.share({ url: link });
  }

  function formatDate(iso: string) {
    const loc = lang === 'en' ? 'en-GB' : lang === 'bg' ? 'bg-BG' : lang === 'uk' ? 'uk-UA' : 'ru-RU';
    return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  }

  if (isLoading) {
    return (
      <Box style={{ minHeight: '100%', background: bg, color: muted, fontFamily: BODY, paddingTop: 48, textAlign: 'center' }}>
        {t.loading}
      </Box>
    );
  }

  return (
    <Box style={{ minHeight: '100%', background: bg, color: text, fontFamily: BODY }}>
      <header style={{ padding: '24px 20px 8px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, letterSpacing: '0.12em', margin: 0 }}>{t.loyaltyBonusesTitle}</h1>
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: muted, margin: '6px 0 0' }}>{t.loyaltyProgramSubtitle}</p>
      </header>

      <section style={card}>
        <Eyebrow color={muted}>{t.loyaltyMyPoints}</Eyebrow>
        <Box style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 600, color: GOLD, lineHeight: 1 }}>{loyalty?.points ?? 0}</span>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1} opacity={0.35}>
            <polygon points="12 2 15 9 22 9 17 14 19 22 12 18 5 22 7 14 2 9 9 9" />
          </svg>
        </Box>
        <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>{fmtTpl(t.loyaltyPointsEqualsEur, { value: eurValue })}</p>
        {loyalty?.status ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '6px 14px', borderRadius: 999, background: loyalty.status.background_color, color: loyalty.status.text_color, fontSize: 12, fontWeight: 600 }}>
            ♦ {loyalty.status.name}
          </span>
        ) : null}
      </section>

      {loyalty?.status ? (
        <section style={card}>
          <Eyebrow color={muted}>{t.loyaltyMyStatus}</Eyebrow>
          <Box style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {loyalty.status.discount_percent != null && loyalty.status.discount_percent > 0 ? (
              <span style={{ fontSize: 13 }}>{fmtTpl(t.loyaltyDiscountPercent, { n: loyalty.status.discount_percent })}</span>
            ) : null}
            {Number(loyalty.status.points_multiplier) > 1 ? (
              <span style={{ fontSize: 13, color: GOLD }}>{fmtTpl(t.loyaltyPointsMultiplier, { n: loyalty.status.points_multiplier })}</span>
            ) : null}
          </Box>
          {loyalty.next_status && loyalty.next_status_visits_remaining != null ? (
            <Progress label={fmtTpl(t.loyaltyNextStatusProgress, { status: loyalty.next_status.name, count: loyalty.next_status_visits_remaining })} pct={progressPct} muted={muted} />
          ) : null}
        </section>
      ) : null}

      {loyalty?.referral_enabled && loyalty.referral_code ? (
        <section style={card}>
          <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, margin: '0 0 6px' }}>{t.loyaltyReferralTitle}</p>
          <p style={{ fontSize: 13, color: muted, margin: '0 0 14px', lineHeight: 1.45 }}>{referralSubtitle}</p>
          <Eyebrow color={muted}>{t.loyaltyReferralYourCode}</Eyebrow>
          <Box style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <code style={{ flex: 1, border: `1px dashed ${GOLD}`, borderRadius: 4, padding: '12px 14px', fontFamily: SERIF, fontSize: 20, fontWeight: 600, letterSpacing: '0.2em', color: GOLD, textAlign: 'center', background: isDark ? 'rgba(201,168,76,.08)' : 'rgba(201,168,76,.06)' }}>
              {loyalty.referral_code}
            </code>
            <button type="button" onClick={copyCode} aria-label={t.loyaltyReferralCopied} style={{ width: 48, border: 'none', borderRadius: 4, background: `linear-gradient(135deg, ${GOLD}, #E0CF6A)`, cursor: 'pointer', color: '#1a1408', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            </button>
          </Box>
          {copied ? <p style={{ fontSize: 12, color: GOLD, marginTop: 8 }}>{t.loyaltyReferralCopied}</p> : null}
          <button type="button" onClick={shareLink} style={{ marginTop: 14, width: '100%', padding: '12px 16px', border: `1px solid ${GOLD}`, borderRadius: 999, background: 'transparent', color: GOLD, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: BODY }}>
            {t.loyaltyReferralShare}
          </button>
        </section>
      ) : null}

      <section style={card}>
        <Eyebrow color={muted}>{t.loyaltyHistoryTitle}</Eyebrow>
        <Box style={{ marginTop: 4 }}>
          {transactions.map((tx) => {
            const plus = tx.points > 0;
            return (
              <Box key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px dotted ${isDark ? 'rgba(255,255,255,.07)' : 'rgba(26,20,8,.06)'}` }}>
                <span style={{ color: plus ? '#4ade80' : '#f87171', width: 20, textAlign: 'center' }}>{plus ? '↑' : '↓'}</span>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Box style={{ fontSize: 13, fontWeight: 500 }}>{tx.description}</Box>
                  <Box style={{ fontSize: 11, color: muted }}>{formatDate(tx.created_at)}</Box>
                </Box>
                <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: plus ? GOLD : muted }}>{plus ? '+' : ''}{tx.points}</span>
              </Box>
            );
          })}
        </Box>
        {transactions.length >= txLimit ? (
          <button type="button" onClick={() => setTxLimit((n) => n + 20)} style={{ marginTop: 12, background: 'none', border: 'none', color: GOLD, fontSize: 13, cursor: 'pointer', fontFamily: BODY }}>
            {t.loyaltyShowAll}
          </button>
        ) : null}
      </section>
      <Box style={{ height: 100 }} />
    </Box>
  );
}
