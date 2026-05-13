export type Lang = 'bg' | 'en' | 'uk' | 'ru';

export interface AppTranslations {
  // Tab bar
  tabHome: string; tabCatalog: string; tabBookings: string; tabProfile: string;
  // Common
  back: string; continueBtn: string; loading: string; noData: string;
  // Greeting
  greeting: string; greetingGuest: string;
  // Language picker
  langPickerTitle: string; langPickerConfirm: string;
  // Months (full name for month selector) and genitive (for date labels)
  monthsLong: string[]; monthsGen: string[]; daysShort: string[];
  // Home
  homeWordmarkItalic: string;
  homeIssuePrefix: string;
  homeH1: string; homeH1i: string;
  homeDesc: string;
  homeBtnSlot: string; homeBtnServices: string;
  homeLiveLabel: string; homeLiveUntil: string; homeLiveDetails: string;
  homeNoBookings: string; homePlanVisit: string;
  homeDayPick: string; homeBtnBook: string;
  homePastVisit: string; homeAddress: string; homeCity: string;
  // Catalog
  catEyebrow: string;
  catH1: string; catH1i: string;
  catSearchPlaceholder: string;
  catAll: string; catHair: string; catNails: string; catFace: string; catBody: string;
  catNotFound: string; catTryOther: string; catFeatured: string;
  // Service detail
  detailDuration: string; detailPrice: string; detailMasters: string; detailBook: string;
  // Booking
  bookEyebrow: string; bookCatH: string; bookCatHi: string;
  bookStep1: string; bookMasterH: string; bookMasterHi: string; bookNoMasters: string;
  /** «Не знаю к какому мастеру» — консультация вместо выбора мастера */
  bookConsultUnknownTitle: string;
  bookConsultUnknownSub: string;
  bookOrPickMaster: string;
  bookConsultCallTitleBefore: string;
  bookConsultCallHi: string;
  bookConsultCallTitleAfter: string;
  bookConsultCallSub: string;
  bookConsultYourRequest: string;
  bookConsultTimeNote: string;
  bookConsultSubmit: string;
  bookConsultSubmitting: string;
  bookStep2: string; bookWhenH: string; bookWhenHi: string;
  bookFreeTime: string; bookSelectDate: string; bookNoSlots: string; bookBtnNext: string;
  bookStep3: string; bookConfirmH: string; bookConfirmHi: string;
  bookSvcLabel: string; bookMasterLabel: string; bookDateTimeLabel: string;
  bookBtnConfirm: string; bookBtnPending: string;
  bookSuccessH: string; bookSuccessHi: string; bookSuccessSub: string; bookSuccessBtn: string;
  bookErrorMsg: string;
  // Master public profile page + catalog row
  masterProfileBack: string;
  masterProfileBookWithMaster: string;
  masterProfileBookService: string;
  masterProfileReadMore: string;
  masterProfileReadLess: string;
  masterProfileSectionServices: string;
  masterProfileSectionPortfolio: string;
  masterProfileSectionCertificates: string;
  masterProfileSectionReviews: string;
  masterProfileShowAllReviews: string;
  masterProfileAnonymous: string;
  masterProfileNoData: string;
  masterRowSelectBook: string;
  bookPickServiceForMaster: string;
  // Booking step 0 when pre-selected master
  bookMasterPreHint: string;
  // Bookings list
  listEyebrow: string; listH: string; listHi: string;
  listTabUpcoming: string; listTabHistory: string;
  listEmpty: string; listBtnNew: string;
  listCancelBtn: string; listCancellingBtn: string;
  listCancelConfirm: string; listCancelError: string;
  listLivePrefix: string;
  listLiveDays: (n: number) => string;
  listLiveHours: (n: number) => string;
  listLiveSoon: string;
  listConsultation: string;
  // Status badges
  stConfirmed: string; stPending: string; stCancelled: string;
  stCompleted: string; stNoShow: string;
  // Profile
  profEyebrow: string; profH: string; profHi: string;
  profVisits: string; profFavorite: string;
  profLang: string; profNotif: string; profContact: string;
  profSignOut: string; profHistory: string;
  // Duration label (service catalog + confirmation)
  bookDurLabel: (totalMinutes: number) => string;
  // Step 1 – master selection checkboxes
  bookCheckboxAnyMaster: string;
  bookCheckboxAnyMasterHint: string;
  // Step 2 – flexible-time checkbox
  bookCheckboxCallForTime: string;
  bookCheckboxCallForTimeHint: string;
  // Step 3 – booking confirmation block
  bookConfirmClientTitle: string;
  bookConfirmNameLabel: string;
  bookConfirmPhoneLabel: string;
  bookConfirmDetailsTitle: string;
  bookConfirmServiceLabel: string;
  bookConfirmMasterLabel: string;
  bookConfirmDateLabel: string;
  bookConfirmTimeLabel: string;
  bookConfirmDurationLabel: string;
  bookConfirmDurationMinutes: (values: { minutes: number }) => string;
  bookConfirmDurationRangeNote: string;
  bookConfirmAnyMasterDisplay: string;
  bookConfirmTimeByPhone: string;
  bookConfirmCommentLabel: string;
  bookConfirmCommentPlaceholder: string;
}

const RU: AppTranslations = {
  tabHome: 'Главная', tabCatalog: 'Каталог', tabBookings: 'Записи', tabProfile: 'Профиль',
  back: 'Назад', continueBtn: 'Продолжить', loading: 'Загрузка...', noData: 'Нет данных',
  greeting: 'Здравствуйте', greetingGuest: 'Гость',
  langPickerTitle: 'Язык интерфейса', langPickerConfirm: 'Подтвердить',
  monthsLong: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
  monthsGen:  ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
  daysShort: ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],
  homeWordmarkItalic: 'Atelier',
  homeIssuePrefix: '№',
  homeH1: 'Записаться', homeH1i: 'сейчас',
  homeDesc: 'Любимые мастера, ваш ритм и расписание — всё в одном жесте.',
  homeBtnSlot: 'Выбрать слот', homeBtnServices: 'Услуги',
  homeLiveLabel: 'Live · Ближайшая запись', homeLiveUntil: 'До записи', homeLiveDetails: 'Подробнее →',
  homeNoBookings: 'Записей нет', homePlanVisit: 'Запланируйте визит',
  homeDayPick: 'Подборка дня', homeBtnBook: 'Записаться',
  homePastVisit: 'Прошлый визит', homeAddress: 'Адрес', homeCity: 'София · Болгария',
  catEyebrow: 'Каталог', catH1: 'Коллекция', catH1i: 'услуг',
  catSearchPlaceholder: 'Услуга или мастер',
  catAll: 'Все', catHair: 'Волосы', catNails: 'Ногти', catFace: 'Лицо', catBody: 'Тело',
  catNotFound: 'Услуги не найдены', catTryOther: 'Попробуйте другой запрос', catFeatured: 'Топ',
  detailDuration: 'Длительность', detailPrice: 'Цена', detailMasters: 'Мастер', detailBook: 'Записаться',
  bookEyebrow: 'Бронирование', bookCatH: 'Коллекция', bookCatHi: 'услуг',
  bookStep1: 'Шаг 1 из 3', bookMasterH: 'Выберите', bookMasterHi: 'мастера', bookNoMasters: 'Нет доступных мастеров',
  bookConsultUnknownTitle: 'Не знаю к какому мастеру',
  bookConsultUnknownSub: 'Обсудим детали и подберём специалиста на созвоне',
  bookOrPickMaster: 'или выберите мастера',
  bookConsultCallTitleBefore: 'Мы ',
  bookConsultCallHi: 'свяжемся',
  bookConsultCallTitleAfter: ' с вами',
  bookConsultCallSub: 'Наш администратор подберёт для вас мастера и удобное время. Ожидайте звонка.',
  bookConsultYourRequest: 'Ваша заявка',
  bookConsultTimeNote: 'Мастер и время — уточним при звонке',
  bookConsultSubmit: 'Отправить заявку',
  bookConsultSubmitting: 'Отправляем...',
  bookStep2: 'Шаг 2 из 3', bookWhenH: 'Когда вам', bookWhenHi: 'удобно',
  bookFreeTime: 'Свободное время', bookSelectDate: 'Выберите дату', bookNoSlots: 'Нет свободного времени', bookBtnNext: 'К подтверждению',
  bookStep3: 'Шаг 3 из 3', bookConfirmH: 'Подтвердите', bookConfirmHi: 'запись',
  bookSvcLabel: 'Услуга', bookMasterLabel: 'Мастер', bookDateTimeLabel: 'Дата и время',
  bookBtnConfirm: 'Подтвердить запись', bookBtnPending: 'Создаём запись...',
  bookSuccessH: 'Запись', bookSuccessHi: 'создана', bookSuccessSub: 'Ждём вас! Напомним о записи заранее.',
  bookSuccessBtn: 'Мои записи', bookErrorMsg: 'Не удалось создать запись. Попробуйте ещё раз.',
  masterProfileBack: 'Назад', masterProfileBookWithMaster: 'Записаться к мастеру', masterProfileBookService: 'Записаться',
  masterProfileReadMore: 'Читать далее', masterProfileReadLess: 'Свернуть',
  masterProfileSectionServices: 'Услуги', masterProfileSectionPortfolio: 'Портфолио', masterProfileSectionCertificates: 'Сертификаты', masterProfileSectionReviews: 'Отзывы',
  masterProfileShowAllReviews: 'Показать все', masterProfileAnonymous: 'Анонимно', masterProfileNoData: 'Пока нет данных',
  masterRowSelectBook: 'Записаться', bookPickServiceForMaster: 'Выберите услугу', bookMasterPreHint: 'Сначала выберите услугу — затем дату и время.',
  listEyebrow: 'Личное', listH: 'Мои', listHi: 'записи',
  listTabUpcoming: 'Предстоящие', listTabHistory: 'Прошедшие',
  listEmpty: 'Пока записей нет', listBtnNew: 'Записаться',
  listCancelBtn: 'Отменить', listCancellingBtn: 'Отменяем...',
  listCancelConfirm: 'Отменить запись?', listCancelError: 'Не удалось отменить запись',
  listLivePrefix: 'Live',
  listLiveDays: (n) => `через ${n} ${n === 1 ? 'день' : n < 5 ? 'дня' : 'дней'}`,
  listLiveHours: (n) => `через ${n} ч`,
  listLiveSoon: 'скоро',
  listConsultation: 'Созвон (дата уточняется)',
  stConfirmed: 'Подтверждено', stPending: 'Ожидание', stCancelled: 'Отменено',
  stCompleted: 'Завершено', stNoShow: 'Не пришёл',
  profEyebrow: 'Профиль', profH: 'Мой', profHi: 'профиль',
  profVisits: 'Визитов', profFavorite: 'Любимая услуга',
  profLang: 'Язык интерфейса', profNotif: 'Уведомления',
  profContact: 'Связаться с салоном', profSignOut: 'Выйти',
  profHistory: 'История визитов',
  bookDurLabel: (m) => m < 60 ? `${m} мин` : m % 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m / 60} ч`,
  bookCheckboxAnyMaster: 'Не важно / любой мастер',
  bookCheckboxAnyMasterHint: 'Назначим свободного мастера.',
  bookCheckboxCallForTime: 'Время не важно — уточним по телефону',
  bookCheckboxCallForTimeHint: 'Перезвоним и согласуем точное время.',
  bookConfirmClientTitle: 'Ваши данные',
  bookConfirmNameLabel: 'Имя',
  bookConfirmPhoneLabel: 'Телефон',
  bookConfirmDetailsTitle: 'Запись',
  bookConfirmServiceLabel: 'Услуга',
  bookConfirmMasterLabel: 'Мастер',
  bookConfirmDateLabel: 'Дата',
  bookConfirmTimeLabel: 'Время',
  bookConfirmDurationLabel: 'Длительность',
  bookConfirmDurationMinutes: ({ minutes }) => `${minutes} мин`,
  bookConfirmDurationRangeNote: 'Длительность уточняется по телефону в зависимости от сложности',
  bookConfirmAnyMasterDisplay: 'Любой свободный мастер',
  bookConfirmTimeByPhone: 'Время согласовывается по телефону',
  bookConfirmCommentLabel: 'Комментарий',
  bookConfirmCommentPlaceholder: 'Ваши пожелания или уточнения...',
};

const EN: AppTranslations = {
  tabHome: 'Home', tabCatalog: 'Catalog', tabBookings: 'Bookings', tabProfile: 'Profile',
  back: 'Back', continueBtn: 'Continue', loading: 'Loading...', noData: 'No data',
  greeting: 'Hello', greetingGuest: 'Guest',
  langPickerTitle: 'Interface language', langPickerConfirm: 'Confirm',
  monthsLong: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthsGen:  ['January','February','March','April','May','June','July','August','September','October','November','December'],
  daysShort: ['Su','Mo','Tu','We','Th','Fr','Sa'],
  homeWordmarkItalic: 'Atelier',
  homeIssuePrefix: 'No.',
  homeH1: 'Book', homeH1i: 'now',
  homeDesc: 'Favourite masters, your rhythm and schedule — all in one gesture.',
  homeBtnSlot: 'Pick a slot', homeBtnServices: 'Services',
  homeLiveLabel: 'Live · Next booking', homeLiveUntil: 'Until booking', homeLiveDetails: 'Details →',
  homeNoBookings: 'No bookings', homePlanVisit: 'Plan a visit',
  homeDayPick: "Today's pick", homeBtnBook: 'Book now',
  homePastVisit: 'Last visit', homeAddress: 'Address', homeCity: 'Sofia · Bulgaria',
  catEyebrow: 'Catalog', catH1: 'Service', catH1i: 'catalog',
  catSearchPlaceholder: 'Service or master',
  catAll: 'All', catHair: 'Hair', catNails: 'Nails', catFace: 'Face', catBody: 'Body',
  catNotFound: 'No services found', catTryOther: 'Try a different query', catFeatured: 'Top',
  detailDuration: 'Duration', detailPrice: 'Price', detailMasters: 'Master', detailBook: 'Book now',
  bookEyebrow: 'Booking', bookCatH: 'Service', bookCatHi: 'catalog',
  bookStep1: 'Step 1 of 3', bookMasterH: 'Choose', bookMasterHi: 'master', bookNoMasters: 'No masters available',
  bookConsultUnknownTitle: "I'm not sure which stylist I need",
  bookConsultUnknownSub: "We'll discuss the details and match you with the right person on a quick call",
  bookOrPickMaster: 'or choose a stylist',
  bookConsultCallTitleBefore: 'We ',
  bookConsultCallHi: 'will reach out',
  bookConsultCallTitleAfter: ' to you',
  bookConsultCallSub: 'Our team will match you with a stylist and a convenient time. Expect a call soon.',
  bookConsultYourRequest: 'Your request',
  bookConsultTimeNote: 'Stylist & time — confirmed by phone',
  bookConsultSubmit: 'Send request',
  bookConsultSubmitting: 'Sending...',
  bookStep2: 'Step 2 of 3', bookWhenH: 'When is it', bookWhenHi: 'convenient',
  bookFreeTime: 'Available time', bookSelectDate: 'Select a date', bookNoSlots: 'No available time', bookBtnNext: 'To confirmation',
  bookStep3: 'Step 3 of 3', bookConfirmH: 'Confirm', bookConfirmHi: 'booking',
  bookSvcLabel: 'Service', bookMasterLabel: 'Master', bookDateTimeLabel: 'Date & time',
  bookBtnConfirm: 'Confirm booking', bookBtnPending: 'Creating booking...',
  bookSuccessH: 'Booking', bookSuccessHi: 'confirmed', bookSuccessSub: "We'll see you! We'll send a reminder.",
  bookSuccessBtn: 'My bookings', bookErrorMsg: 'Could not create booking. Please try again.',
  masterProfileBack: 'Back', masterProfileBookWithMaster: 'Book with this stylist', masterProfileBookService: 'Book',
  masterProfileReadMore: 'Read more', masterProfileReadLess: 'Show less',
  masterProfileSectionServices: 'Services', masterProfileSectionPortfolio: 'Portfolio', masterProfileSectionCertificates: 'Certificates', masterProfileSectionReviews: 'Reviews',
  masterProfileShowAllReviews: 'Show all', masterProfileAnonymous: 'Anonymous', masterProfileNoData: 'Nothing here yet',
  masterRowSelectBook: 'Book', bookPickServiceForMaster: 'Choose a service', bookMasterPreHint: 'Pick a service, then date and time.',
  listEyebrow: 'Personal', listH: 'My', listHi: 'bookings',
  listTabUpcoming: 'Upcoming', listTabHistory: 'History',
  listEmpty: 'No bookings yet', listBtnNew: 'Book',
  listCancelBtn: 'Cancel', listCancellingBtn: 'Cancelling...',
  listCancelConfirm: 'Cancel this booking?', listCancelError: 'Could not cancel booking',
  listLivePrefix: 'Live',
  listLiveDays: (n) => `in ${n} ${n === 1 ? 'day' : 'days'}`,
  listLiveHours: (n) => `in ${n}h`,
  listLiveSoon: 'soon',
  listConsultation: 'Consultation (date TBD)',
  stConfirmed: 'Confirmed', stPending: 'Pending', stCancelled: 'Cancelled',
  stCompleted: 'Completed', stNoShow: 'No show',
  profEyebrow: 'Profile', profH: 'My', profHi: 'profile',
  profVisits: 'Visits', profFavorite: 'Favourite service',
  profLang: 'Interface language', profNotif: 'Notifications',
  profContact: 'Contact salon', profSignOut: 'Sign out',
  profHistory: 'Visit history',
  bookDurLabel: (m) => m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`,
  bookCheckboxAnyMaster: 'Any available master',
  bookCheckboxAnyMasterHint: 'We will assign an available master.',
  bookCheckboxCallForTime: 'Time is flexible / confirm by phone',
  bookCheckboxCallForTimeHint: 'We will call you to confirm the exact time.',
  bookConfirmClientTitle: 'Your details',
  bookConfirmNameLabel: 'Name',
  bookConfirmPhoneLabel: 'Phone',
  bookConfirmDetailsTitle: 'Appointment',
  bookConfirmServiceLabel: 'Service',
  bookConfirmMasterLabel: 'Master',
  bookConfirmDateLabel: 'Date',
  bookConfirmTimeLabel: 'Time',
  bookConfirmDurationLabel: 'Duration',
  bookConfirmDurationMinutes: ({ minutes }) => `${minutes} min`,
  bookConfirmDurationRangeNote: 'Duration will be confirmed by phone depending on complexity',
  bookConfirmAnyMasterDisplay: 'Any available master',
  bookConfirmTimeByPhone: 'Time to be confirmed by phone',
  bookConfirmCommentLabel: 'Comment',
  bookConfirmCommentPlaceholder: 'Your wishes or notes...',
};

const UK: AppTranslations = {
  tabHome: 'Головна', tabCatalog: 'Каталог', tabBookings: 'Записи', tabProfile: 'Профіль',
  back: 'Назад', continueBtn: 'Продовжити', loading: 'Завантаження...', noData: 'Немає даних',
  greeting: 'Вітаємо', greetingGuest: 'Гість',
  langPickerTitle: 'Мова інтерфейсу', langPickerConfirm: 'Підтвердити',
  monthsLong: ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],
  monthsGen:  ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'],
  daysShort: ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'],
  homeWordmarkItalic: 'Atelier',
  homeIssuePrefix: '№',
  homeH1: 'Записатись', homeH1i: 'зараз',
  homeDesc: 'Улюблені майстри, ваш ритм і розклад — все в одному жесті.',
  homeBtnSlot: 'Обрати слот', homeBtnServices: 'Послуги',
  homeLiveLabel: 'Live · Наступний запис', homeLiveUntil: 'До запису', homeLiveDetails: 'Детальніше →',
  homeNoBookings: 'Записів немає', homePlanVisit: 'Заплануйте візит',
  homeDayPick: 'Добірка дня', homeBtnBook: 'Записатись',
  homePastVisit: 'Минулий візит', homeAddress: 'Адреса', homeCity: 'Софія · Болгарія',
  catEyebrow: 'Каталог', catH1: 'Колекція', catH1i: 'послуг',
  catSearchPlaceholder: 'Послуга або майстер',
  catAll: 'Всі', catHair: 'Волосся', catNails: 'Нігті', catFace: 'Обличчя', catBody: 'Тіло',
  catNotFound: 'Послуги не знайдено', catTryOther: 'Спробуйте інший запит', catFeatured: 'Топ',
  detailDuration: 'Тривалість', detailPrice: 'Ціна', detailMasters: 'Майстер', detailBook: 'Записатись',
  bookEyebrow: 'Бронювання', bookCatH: 'Колекція', bookCatHi: 'послуг',
  bookStep1: 'Крок 1 з 3', bookMasterH: 'Оберіть', bookMasterHi: 'майстра', bookNoMasters: 'Немає доступних майстрів',
  bookConsultUnknownTitle: 'Не знаю, до якого майстра',
  bookConsultUnknownSub: 'Обговоримо деталі й підберемо спеціаліста під час дзвінка',
  bookOrPickMaster: 'або оберіть майстра',
  bookConsultCallTitleBefore: 'Ми ',
  bookConsultCallHi: 'звʼяжемося',
  bookConsultCallTitleAfter: ' з вами',
  bookConsultCallSub: 'Адміністратор підбере майстра й зручний час. Очікуйте дзвінка.',
  bookConsultYourRequest: 'Ваша заявка',
  bookConsultTimeNote: 'Майстра й час уточнимо під час дзвінка',
  bookConsultSubmit: 'Надіслати заявку',
  bookConsultSubmitting: 'Надсилаємо...',
  bookStep2: 'Крок 2 з 3', bookWhenH: 'Коли вам', bookWhenHi: 'зручно',
  bookFreeTime: 'Вільний час', bookSelectDate: 'Оберіть дату', bookNoSlots: 'Немає вільного часу', bookBtnNext: 'До підтвердження',
  bookStep3: 'Крок 3 з 3', bookConfirmH: 'Підтвердіть', bookConfirmHi: 'запис',
  bookSvcLabel: 'Послуга', bookMasterLabel: 'Майстер', bookDateTimeLabel: 'Дата і час',
  bookBtnConfirm: 'Підтвердити запис', bookBtnPending: 'Створюємо запис...',
  bookSuccessH: 'Запис', bookSuccessHi: 'створено', bookSuccessSub: 'Чекаємо вас! Нагадаємо про запис заздалегідь.',
  bookSuccessBtn: 'Мої записи', bookErrorMsg: 'Не вдалося створити запис. Спробуйте ще раз.',
  masterProfileBack: 'Назад', masterProfileBookWithMaster: 'Записатися до майстра', masterProfileBookService: 'Записатися',
  masterProfileReadMore: 'Читати далі', masterProfileReadLess: 'Згорнути',
  masterProfileSectionServices: 'Послуги', masterProfileSectionPortfolio: 'Портфоліо', masterProfileSectionCertificates: 'Сертифікати', masterProfileSectionReviews: 'Відгуки',
  masterProfileShowAllReviews: 'Показати всі', masterProfileAnonymous: 'Анонімно', masterProfileNoData: 'Поки немає даних',
  masterRowSelectBook: 'Записатися', bookPickServiceForMaster: 'Оберіть послугу', bookMasterPreHint: 'Спочатку послугу — потім дату й час.',
  listEyebrow: 'Особисте', listH: 'Мої', listHi: 'записи',
  listTabUpcoming: 'Майбутні', listTabHistory: 'Минулі',
  listEmpty: 'Поки немає записів', listBtnNew: 'Записатись',
  listCancelBtn: 'Скасувати', listCancellingBtn: 'Скасовуємо...',
  listCancelConfirm: 'Скасувати запис?', listCancelError: 'Не вдалося скасувати запис',
  listLivePrefix: 'Live',
  listLiveDays: (n) => `через ${n} ${n === 1 ? 'день' : n < 5 ? 'дні' : 'днів'}`,
  listLiveHours: (n) => `через ${n} год`,
  listLiveSoon: 'скоро',
  listConsultation: 'Дзвінок (дата уточнюється)',
  stConfirmed: 'Підтверджено', stPending: 'Очікування', stCancelled: 'Скасовано',
  stCompleted: 'Завершено', stNoShow: 'Не прийшов',
  profEyebrow: 'Профіль', profH: 'Мій', profHi: 'профіль',
  profVisits: 'Візитів', profFavorite: 'Улюблена послуга',
  profLang: 'Мова інтерфейсу', profNotif: 'Сповіщення',
  profContact: "Зв'язатися із салоном", profSignOut: 'Вийти',
  profHistory: 'Історія візитів',
  bookDurLabel: (m) => m < 60 ? `${m} хв` : m % 60 ? `${Math.floor(m / 60)} год ${m % 60} хв` : `${m / 60} год`,
  bookCheckboxAnyMaster: 'Не важливо / будь-який майстер',
  bookCheckboxAnyMasterHint: 'Призначимо вільного майстра.',
  bookCheckboxCallForTime: 'Час не важливий — узгодимо по телефону',
  bookCheckboxCallForTimeHint: 'Ми передзвонимо й узгодимо точний час.',
  bookConfirmClientTitle: 'Ваші дані',
  bookConfirmNameLabel: "Ім'я",
  bookConfirmPhoneLabel: 'Телефон',
  bookConfirmDetailsTitle: 'Запис',
  bookConfirmServiceLabel: 'Послуга',
  bookConfirmMasterLabel: 'Майстер',
  bookConfirmDateLabel: 'Дата',
  bookConfirmTimeLabel: 'Час',
  bookConfirmDurationLabel: 'Тривалість',
  bookConfirmDurationMinutes: ({ minutes }) => `${minutes} хв`,
  bookConfirmDurationRangeNote: 'Тривалість уточнюється по телефону залежно від складності',
  bookConfirmAnyMasterDisplay: 'Будь-який вільний майстер',
  bookConfirmTimeByPhone: 'Час узгоджується по телефону',
  bookConfirmCommentLabel: 'Коментар',
  bookConfirmCommentPlaceholder: 'Ваші побажання або уточнення...',
};

const BG: AppTranslations = {
  tabHome: 'Начало', tabCatalog: 'Каталог', tabBookings: 'Записи', tabProfile: 'Профил',
  back: 'Назад', continueBtn: 'Продължи', loading: 'Зареждане...', noData: 'Няма данни',
  greeting: 'Здравейте', greetingGuest: 'Гост',
  langPickerTitle: 'Език на интерфейса', langPickerConfirm: 'Потвърди',
  monthsLong: ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'],
  monthsGen:  ['януари','февруари','март','април','май','юни','юли','август','септември','октомври','ноември','декември'],
  daysShort: ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'],
  homeWordmarkItalic: 'Atelier',
  homeIssuePrefix: '№',
  homeH1: 'Запази', homeH1i: 'сега',
  homeDesc: 'Любими майстори, вашият ритъм и разписание — всичко с един жест.',
  homeBtnSlot: 'Избери слот', homeBtnServices: 'Услуги',
  homeLiveLabel: 'Live · Следващ запис', homeLiveUntil: 'До записа', homeLiveDetails: 'Детайли →',
  homeNoBookings: 'Няма записи', homePlanVisit: 'Планирайте посещение',
  homeDayPick: 'Избор на деня', homeBtnBook: 'Запиши се',
  homePastVisit: 'Последно посещение', homeAddress: 'Адрес', homeCity: 'София · България',
  catEyebrow: 'Каталог', catH1: 'Колекция', catH1i: 'услуги',
  catSearchPlaceholder: 'Услуга или майстор',
  catAll: 'Всички', catHair: 'Коса', catNails: 'Нокти', catFace: 'Лице', catBody: 'Тяло',
  catNotFound: 'Услуги не са намерени', catTryOther: 'Опитайте друга заявка', catFeatured: 'Топ',
  detailDuration: 'Продължителност', detailPrice: 'Цена', detailMasters: 'Майстор', detailBook: 'Запиши се',
  bookEyebrow: 'Резервация', bookCatH: 'Колекция', bookCatHi: 'услуги',
  bookStep1: 'Стъпка 1 от 3', bookMasterH: 'Изберете', bookMasterHi: 'майстор', bookNoMasters: 'Няма достъпни майстори',
  bookConsultUnknownTitle: 'Не знам към кой майстор',
  bookConsultUnknownSub: 'Ще обсъдим детайлите и ще ви насочим към специалист при обаждане',
  bookOrPickMaster: 'или изберете майстор',
  bookConsultCallTitleBefore: 'Ще се ',
  bookConsultCallHi: 'свържем',
  bookConsultCallTitleAfter: ' с вас',
  bookConsultCallSub: 'Администраторът ще ви насочи към майстор и удобно време. Очаквайте обаждане.',
  bookConsultYourRequest: 'Вашата заявка',
  bookConsultTimeNote: 'Майстор и час — ще уточним по телефона',
  bookConsultSubmit: 'Изпрати заявка',
  bookConsultSubmitting: 'Изпращаме...',
  bookStep2: 'Стъпка 2 от 3', bookWhenH: 'Кога ви е', bookWhenHi: 'удобно',
  bookFreeTime: 'Свободно време', bookSelectDate: 'Изберете дата', bookNoSlots: 'Няма свободно време', bookBtnNext: 'Към потвърждение',
  bookStep3: 'Стъпка 3 от 3', bookConfirmH: 'Потвърдете', bookConfirmHi: 'записа',
  bookSvcLabel: 'Услуга', bookMasterLabel: 'Майстор', bookDateTimeLabel: 'Дата и час',
  bookBtnConfirm: 'Потвърди записа', bookBtnPending: 'Създаваме запис...',
  bookSuccessH: 'Записът е', bookSuccessHi: 'създаден', bookSuccessSub: 'Очакваме ви! Ще ви напомним предварително.',
  bookSuccessBtn: 'Моите записи', bookErrorMsg: 'Неуспешно създаване. Моля, опитайте отново.',
  masterProfileBack: 'Назад', masterProfileBookWithMaster: 'Запиши се при майстора', masterProfileBookService: 'Запиши се',
  masterProfileReadMore: 'Още', masterProfileReadLess: 'По-малко',
  masterProfileSectionServices: 'Услуги', masterProfileSectionPortfolio: 'Портфолио', masterProfileSectionCertificates: 'Сертификати', masterProfileSectionReviews: 'Отзиви',
  masterProfileShowAllReviews: 'Всички', masterProfileAnonymous: 'Анонимно', masterProfileNoData: 'Все още няма данни',
  masterRowSelectBook: 'Запиши се', bookPickServiceForMaster: 'Изберете услуга', bookMasterPreHint: 'Първо услуга — после дата и час.',
  listEyebrow: 'Лично', listH: 'Моите', listHi: 'записи',
  listTabUpcoming: 'Предстоящи', listTabHistory: 'Минали',
  listEmpty: 'Засега няма записи', listBtnNew: 'Запиши се',
  listCancelBtn: 'Откажи', listCancellingBtn: 'Отказваме...',
  listCancelConfirm: 'Откажи записа?', listCancelError: 'Неуспешно отказване на записа',
  listLivePrefix: 'Live',
  listLiveDays: (n) => `след ${n} ${n === 1 ? 'ден' : 'дни'}`,
  listLiveHours: (n) => `след ${n} ч`,
  listLiveSoon: 'скоро',
  listConsultation: 'Консултация (датата се уточнява)',
  stConfirmed: 'Потвърдено', stPending: 'Изчакване', stCancelled: 'Отказано',
  stCompleted: 'Завършено', stNoShow: 'Не се яви',
  profEyebrow: 'Профил', profH: 'Моят', profHi: 'профил',
  profVisits: 'Посещения', profFavorite: 'Любима услуга',
  profLang: 'Език на интерфейса', profNotif: 'Известия',
  profContact: 'Свържете се с салона', profSignOut: 'Изход',
  profHistory: 'История на посещенията',
  bookDurLabel: (m) => m < 60 ? `${m} мин` : m % 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m / 60} ч`,
  bookCheckboxAnyMaster: 'Без значение / всеки майстор',
  bookCheckboxAnyMasterHint: 'Ще назначим свободен майстор.',
  bookCheckboxCallForTime: 'Часът не е важен — по телефон',
  bookCheckboxCallForTimeHint: 'Ще ви се обадим за точен час.',
  bookConfirmClientTitle: 'Вашите данни',
  bookConfirmNameLabel: 'Име',
  bookConfirmPhoneLabel: 'Телефон',
  bookConfirmDetailsTitle: 'Записване',
  bookConfirmServiceLabel: 'Услуга',
  bookConfirmMasterLabel: 'Майстор',
  bookConfirmDateLabel: 'Дата',
  bookConfirmTimeLabel: 'Час',
  bookConfirmDurationLabel: 'Продължителност',
  bookConfirmDurationMinutes: ({ minutes }) => `${minutes} мин`,
  bookConfirmDurationRangeNote: 'Продължителността се уточнява по телефон според сложността',
  bookConfirmAnyMasterDisplay: 'Всеки свободен майстор',
  bookConfirmTimeByPhone: 'Часът се уточнява по телефон',
  bookConfirmCommentLabel: 'Коментар',
  bookConfirmCommentPlaceholder: 'Вашите пожелания или уточнения...',
};

export const translations: Record<Lang, AppTranslations> = { ru: RU, en: EN, uk: UK, bg: BG };
