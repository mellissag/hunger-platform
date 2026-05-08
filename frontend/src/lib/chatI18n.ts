export const CHAT_I18N = {
  ru: {
    chooseTitle: 'Чем можем помочь?',
    aiButton: 'Спросить AI-консультанта',
    aiSubtitle: 'Ответит мгновенно',
    masterButton: 'Написать мастеру',
    masterSubtitle: 'Живой ответ за 5–10 мин',
    aiWelcome:
      'Привет! Я AI-консультант салона. Расскажу об услугах, ценах и мастерах. Чем могу помочь?',
    masterWelcome: 'Сообщение отправлено. Мастер ответит в течение 5–10 минут.',
    masterPrompt: 'Напишите ваш вопрос:',
    send: 'Отправить',
    close: 'Закрыть',
    placeholder: 'Напишите сообщение...',
    typing: 'Печатает...',
    backToBook: 'Вернуться к записи',
  },
  en: {
    chooseTitle: 'How can we help?',
    aiButton: 'Ask AI consultant',
    aiSubtitle: 'Instant reply',
    masterButton: 'Write to master',
    masterSubtitle: 'Live reply in 5–10 min',
    aiWelcome:
      "Hi! I'm the salon AI consultant. I'll tell you about our services, prices and masters. How can I help?",
    masterWelcome: 'Message sent. A master will reply within 5–10 minutes.',
    masterPrompt: 'Write your question:',
    send: 'Send',
    close: 'Close',
    placeholder: 'Type a message...',
    typing: 'Typing...',
    backToBook: 'Back to booking',
  },
  uk: {
    chooseTitle: 'Чим можемо допомогти?',
    aiButton: 'Запитати AI-консультанта',
    aiSubtitle: 'Відповість миттєво',
    masterButton: 'Написати майстру',
    masterSubtitle: 'Жива відповідь за 5–10 хв',
    aiWelcome:
      'Привіт! Я AI-консультант салону. Розповім про послуги, ціни та майстрів. Чим можу допомогти?',
    masterWelcome: 'Повідомлення надіслано. Майстер відповість протягом 5–10 хвилин.',
    masterPrompt: 'Напишіть ваше запитання:',
    send: 'Надіслати',
    close: 'Закрити',
    placeholder: 'Напишіть повідомлення...',
    typing: 'Друкує...',
    backToBook: 'Повернутися до запису',
  },
  bg: {
    chooseTitle: 'Как можем да помогнем?',
    aiButton: 'Питай AI консултанта',
    aiSubtitle: 'Незабавен отговор',
    masterButton: 'Пиши на майстора',
    masterSubtitle: 'Жив отговор за 5–10 мин',
    aiWelcome:
      'Здравейте! Аз съм AI консултантът на салона. Ще ви разкажа за услугите, цените и майсторите.',
    masterWelcome: 'Съобщението е изпратено. Майсторът ще отговори до 5–10 минути.',
    masterPrompt: 'Напишете вашия въпрос:',
    send: 'Изпрати',
    close: 'Затвори',
    placeholder: 'Напишете съобщение...',
    typing: 'Пише...',
    backToBook: 'Обратно към записа',
  },
} as const;

export type ChatLang = keyof typeof CHAT_I18N;

export function getChatT(lang: string) {
  const l: ChatLang = (lang in CHAT_I18N ? lang : 'ru') as ChatLang;
  return CHAT_I18N[l];
}
