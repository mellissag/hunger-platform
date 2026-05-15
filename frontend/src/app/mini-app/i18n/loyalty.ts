import type { Lang } from './translations';

export type LoyaltyTranslations = {
  tabBonuses: string;
  loyaltyBonusesTitle: string;
  loyaltyProgramSubtitle: string;
  loyaltyMyPoints: string;
  loyaltyPointsEqualsEur: string;
  loyaltyMyStatus: string;
  loyaltyNoStatus: string;
  loyaltyDiscountPercent: string;
  loyaltyPointsMultiplier: string;
  loyaltyNextStatusProgress: string;
  loyaltyReferralTitle: string;
  loyaltyReferralSubtitleBoth: string;
  loyaltyReferralSubtitleReferrerOnly: string;
  loyaltyReferralSubtitleInvitedOnly: string;
  loyaltyReferralYourCode: string;
  loyaltyReferralCopied: string;
  loyaltyReferralShare: string;
  loyaltyHistoryTitle: string;
  loyaltyShowAll: string;
  loyaltyGoToBonuses: string;
  loyaltyHomeStrip: string;
  loyaltyPromoQuestion: string;
  loyaltyPromoPlaceholder: string;
  loyaltyPromoApply: string;
  loyaltyPromoRemove: string;
  loyaltyPromoSuccess: string;
  loyaltyPromoSuccessPercent: string;
  loyaltyPromoInvalid: string;
  loyaltyPromoExpired: string;
  loyaltyPromoMinAmount: string;
  loyaltyPromoLimitReached: string;
  loyaltyTotalWithDiscount: string;
};

export function fmtTpl(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    s,
  );
}

const RU: LoyaltyTranslations = {
  tabBonuses: 'Бонусы',
  loyaltyBonusesTitle: 'БОНУСЫ',
  loyaltyProgramSubtitle: 'программа лояльности',
  loyaltyMyPoints: 'Мои баллы',
  loyaltyPointsEqualsEur: '= €{{value}}',
  loyaltyMyStatus: 'Мой статус',
  loyaltyNoStatus: 'Нет статуса',
  loyaltyDiscountPercent: 'Скидка {{n}}%',
  loyaltyPointsMultiplier: 'Баллы ×{{n}}',
  loyaltyNextStatusProgress: 'До {{status}}: ещё {{count}} визитов',
  loyaltyReferralTitle: 'Пригласите друга — получите бонус!',
  loyaltyReferralSubtitleBoth: 'Вы получите {{referrer}} баллов, друг получит {{invited}} баллов',
  loyaltyReferralSubtitleReferrerOnly: 'Вы получите {{referrer}} баллов за каждого приглашённого',
  loyaltyReferralSubtitleInvitedOnly: 'Ваш друг получит {{invited}} баллов при первом визите',
  loyaltyReferralYourCode: 'Ваш код',
  loyaltyReferralCopied: 'Скопировано!',
  loyaltyReferralShare: 'Поделиться ссылкой',
  loyaltyHistoryTitle: 'История баллов',
  loyaltyShowAll: 'Показать всё →',
  loyaltyGoToBonuses: 'Перейти в Бонусы',
  loyaltyHomeStrip: '{{points}} баллов',
  loyaltyPromoQuestion: 'У вас есть промокод?',
  loyaltyPromoPlaceholder: 'Введите промокод',
  loyaltyPromoApply: 'Применить',
  loyaltyPromoRemove: 'Убрать',
  loyaltyPromoSuccess: 'Скидка -€{{amount}} (промокод {{code}})',
  loyaltyPromoSuccessPercent: 'Скидка -{{percent}}% (промокод {{code}})',
  loyaltyPromoInvalid: 'Промокод не найден',
  loyaltyPromoExpired: 'Промокод истёк',
  loyaltyPromoMinAmount: 'Минимальная сумма заказа €{{amount}}',
  loyaltyPromoLimitReached: 'Вы уже использовали этот промокод',
  loyaltyTotalWithDiscount: 'Итого: €{{amount}}',
};

const EN: LoyaltyTranslations = {
  tabBonuses: 'Bonuses',
  loyaltyBonusesTitle: 'BONUSES',
  loyaltyProgramSubtitle: 'loyalty program',
  loyaltyMyPoints: 'My Points',
  loyaltyPointsEqualsEur: '= €{{value}}',
  loyaltyMyStatus: 'My Status',
  loyaltyNoStatus: 'No Status',
  loyaltyDiscountPercent: '{{n}}% Discount',
  loyaltyPointsMultiplier: 'Points ×{{n}}',
  loyaltyNextStatusProgress: 'To {{status}}: {{count}} more visits',
  loyaltyReferralTitle: 'Invite a friend — get a bonus!',
  loyaltyReferralSubtitleBoth: 'You get {{referrer}} points, your friend gets {{invited}} points',
  loyaltyReferralSubtitleReferrerOnly: 'You get {{referrer}} points for each invited friend',
  loyaltyReferralSubtitleInvitedOnly: 'Your friend gets {{invited}} points on their first visit',
  loyaltyReferralYourCode: 'Your code',
  loyaltyReferralCopied: 'Copied!',
  loyaltyReferralShare: 'Share link',
  loyaltyHistoryTitle: 'Points History',
  loyaltyShowAll: 'Show all →',
  loyaltyGoToBonuses: 'Go to Bonuses',
  loyaltyHomeStrip: '{{points}} points',
  loyaltyPromoQuestion: 'Do you have a promo code?',
  loyaltyPromoPlaceholder: 'Enter promo code',
  loyaltyPromoApply: 'Apply',
  loyaltyPromoRemove: 'Remove',
  loyaltyPromoSuccess: 'Discount -€{{amount}} (code {{code}})',
  loyaltyPromoSuccessPercent: 'Discount -{{percent}}% (code {{code}})',
  loyaltyPromoInvalid: 'Promo code not found',
  loyaltyPromoExpired: 'Promo code has expired',
  loyaltyPromoMinAmount: 'Minimum order amount €{{amount}}',
  loyaltyPromoLimitReached: 'You have already used this promo code',
  loyaltyTotalWithDiscount: 'Total: €{{amount}}',
};

const UK: LoyaltyTranslations = {
  tabBonuses: 'Бонуси',
  loyaltyBonusesTitle: 'БОНУСИ',
  loyaltyProgramSubtitle: 'програма лояльності',
  loyaltyMyPoints: 'Мої бали',
  loyaltyPointsEqualsEur: '= €{{value}}',
  loyaltyMyStatus: 'Мій статус',
  loyaltyNoStatus: 'Без статусу',
  loyaltyDiscountPercent: 'Знижка {{n}}%',
  loyaltyPointsMultiplier: 'Бали ×{{n}}',
  loyaltyNextStatusProgress: 'До {{status}}: ще {{count}} візитів',
  loyaltyReferralTitle: 'Запросіть друга — отримайте бонус!',
  loyaltyReferralSubtitleBoth: 'Ви отримаєте {{referrer}} балів, друг отримає {{invited}} балів',
  loyaltyReferralSubtitleReferrerOnly: 'Ви отримаєте {{referrer}} балів за кожного запрошеного',
  loyaltyReferralSubtitleInvitedOnly: 'Ваш друг отримає {{invited}} балів при першому візиті',
  loyaltyReferralYourCode: 'Ваш код',
  loyaltyReferralCopied: 'Скопійовано!',
  loyaltyReferralShare: 'Поділитися посиланням',
  loyaltyHistoryTitle: 'Історія балів',
  loyaltyShowAll: 'Показати все →',
  loyaltyGoToBonuses: 'Перейти до Бонусів',
  loyaltyHomeStrip: '{{points}} балів',
  loyaltyPromoQuestion: 'У вас є промокод?',
  loyaltyPromoPlaceholder: 'Введіть промокод',
  loyaltyPromoApply: 'Застосувати',
  loyaltyPromoRemove: 'Прибрати',
  loyaltyPromoSuccess: 'Знижка -€{{amount}} (промокод {{code}})',
  loyaltyPromoSuccessPercent: 'Знижка -{{percent}}% (промокод {{code}})',
  loyaltyPromoInvalid: 'Промокод не знайдено',
  loyaltyPromoExpired: 'Термін дії промокоду закінчився',
  loyaltyPromoMinAmount: 'Мінімальна сума замовлення €{{amount}}',
  loyaltyPromoLimitReached: 'Ви вже використали цей промокод',
  loyaltyTotalWithDiscount: 'Разом: €{{amount}}',
};

const BG: LoyaltyTranslations = {
  tabBonuses: 'Бонуси',
  loyaltyBonusesTitle: 'БОНУСИ',
  loyaltyProgramSubtitle: 'програма за лоялност',
  loyaltyMyPoints: 'Моите точки',
  loyaltyPointsEqualsEur: '= €{{value}}',
  loyaltyMyStatus: 'Моят статус',
  loyaltyNoStatus: 'Без статус',
  loyaltyDiscountPercent: 'Отстъпка {{n}}%',
  loyaltyPointsMultiplier: 'Точки ×{{n}}',
  loyaltyNextStatusProgress: 'До {{status}}: още {{count}} посещения',
  loyaltyReferralTitle: 'Покани приятел — получи бонус!',
  loyaltyReferralSubtitleBoth: 'Ти получаваш {{referrer}} точки, приятелят ти получава {{invited}} точки',
  loyaltyReferralSubtitleReferrerOnly: 'Получаваш {{referrer}} точки за всеки поканен приятел',
  loyaltyReferralSubtitleInvitedOnly: 'Приятелят ти получава {{invited}} точки при първото посещение',
  loyaltyReferralYourCode: 'Твоят код',
  loyaltyReferralCopied: 'Копирано!',
  loyaltyReferralShare: 'Сподели връзка',
  loyaltyHistoryTitle: 'История на точките',
  loyaltyShowAll: 'Покажи всички →',
  loyaltyGoToBonuses: 'Към Бонуси',
  loyaltyHomeStrip: '{{points}} точки',
  loyaltyPromoQuestion: 'Имате ли промо код?',
  loyaltyPromoPlaceholder: 'Въведете промо код',
  loyaltyPromoApply: 'Приложи',
  loyaltyPromoRemove: 'Премахни',
  loyaltyPromoSuccess: 'Отстъпка -€{{amount}} (код {{code}})',
  loyaltyPromoSuccessPercent: 'Отстъпка -{{percent}}% (код {{code}})',
  loyaltyPromoInvalid: 'Промо кодът не е намерен',
  loyaltyPromoExpired: 'Промо кодът е изтекъл',
  loyaltyPromoMinAmount: 'Минимална сума на поръчката €{{amount}}',
  loyaltyPromoLimitReached: 'Вече сте използвали този промо код',
  loyaltyTotalWithDiscount: 'Общо: €{{amount}}',
};

export const loyaltyTranslations: Record<Lang, LoyaltyTranslations> = {
  ru: RU,
  en: EN,
  uk: UK,
  bg: BG,
};
