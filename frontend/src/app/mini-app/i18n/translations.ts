export type Lang = 'bg' | 'en' | 'uk' | 'ru';

export interface AppTranslations {
  // Tab bar
  tabHome: string; tabCatalog: string; tabBookings: string; tabProfile: string;
  // Common
  back: string; continueBtn: string; loading: string; noData: string;
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
  bookStep2: string; bookWhenH: string; bookWhenHi: string;
  bookFreeTime: string; bookSelectDate: string; bookNoSlots: string; bookBtnNext: string;
  bookStep3: string; bookConfirmH: string; bookConfirmHi: string;
  bookSvcLabel: string; bookMasterLabel: string; bookDateTimeLabel: string;
  bookBtnConfirm: string; bookBtnPending: string;
  bookSuccessH: string; bookSuccessHi: string; bookSuccessSub: string; bookSuccessBtn: string;
  bookErrorMsg: string;
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
  // Status badges
  stConfirmed: string; stPending: string; stCancelled: string;
  stCompleted: string; stNoShow: string;
  // Profile
  profEyebrow: string; profH: string; profHi: string;
  profVisits: string; profFavorite: string;
  profLang: string; profNotif: string; profContact: string;
  profSignOut: string; profHistory: string;
}

const RU: AppTranslations = {
  tabHome: 'Главная', tabCatalog: 'Каталог', tabBookings: 'Записи', tabProfile: 'Профиль',
  back: 'Назад', continueBtn: 'Продолжить', loading: 'Загрузка...', noData: 'Нет данных',
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
  bookStep2: 'Шаг 2 из 3', bookWhenH: 'Когда вам', bookWhenHi: 'удобно',
  bookFreeTime: 'Свободное время', bookSelectDate: 'Выберите дату', bookNoSlots: 'Нет свободного времени', bookBtnNext: 'К подтверждению',
  bookStep3: 'Шаг 3 из 3', bookConfirmH: 'Подтвердите', bookConfirmHi: 'запись',
  bookSvcLabel: 'Услуга', bookMasterLabel: 'Мастер', bookDateTimeLabel: 'Дата и время',
  bookBtnConfirm: 'Подтвердить запись', bookBtnPending: 'Создаём запись...',
  bookSuccessH: 'Запись', bookSuccessHi: 'создана', bookSuccessSub: 'Ждём вас! Напомним о записи заранее.',
  bookSuccessBtn: 'Мои записи', bookErrorMsg: 'Не удалось создать запись. Попробуйте ещё раз.',
  listEyebrow: 'Личное', listH: 'Мои', listHi: 'записи',
  listTabUpcoming: 'Предстоящие', listTabHistory: 'Прошедшие',
  listEmpty: 'Пока записей нет', listBtnNew: 'Записаться',
  listCancelBtn: 'Отменить', listCancellingBtn: 'Отменяем...',
  listCancelConfirm: 'Отменить запись?', listCancelError: 'Не удалось отменить запись',
  listLivePrefix: 'Live',
  listLiveDays: (n) => `через ${n} ${n === 1 ? 'день' : n < 5 ? 'дня' : 'дней'}`,
  listLiveHours: (n) => `через ${n} ч`,
  listLiveSoon: 'скоро',
  stConfirmed: 'Подтверждено', stPending: 'Ожидание', stCancelled: 'Отменено',
  stCompleted: 'Завершено', stNoShow: 'Не пришёл',
  profEyebrow: 'Профиль', profH: 'Мой', profHi: 'профиль',
  profVisits: 'Визитов', profFavorite: 'Любимая услуга',
  profLang: 'Язык интерфейса', profNotif: 'Уведомления',
  profContact: 'Связаться с салоном', profSignOut: 'Выйти',
  profHistory: 'История визитов',
};

const EN: AppTranslations = {
  tabHome: 'Home', tabCatalog: 'Catalog', tabBookings: 'Bookings', tabProfile: 'Profile',
  back: 'Back', continueBtn: 'Continue', loading: 'Loading...', noData: 'No data',
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
  bookStep2: 'Step 2 of 3', bookWhenH: 'When is it', bookWhenHi: 'convenient',
  bookFreeTime: 'Available time', bookSelectDate: 'Select a date', bookNoSlots: 'No available time', bookBtnNext: 'To confirmation',
  bookStep3: 'Step 3 of 3', bookConfirmH: 'Confirm', bookConfirmHi: 'booking',
  bookSvcLabel: 'Service', bookMasterLabel: 'Master', bookDateTimeLabel: 'Date & time',
  bookBtnConfirm: 'Confirm booking', bookBtnPending: 'Creating booking...',
  bookSuccessH: 'Booking', bookSuccessHi: 'confirmed', bookSuccessSub: "We'll see you! We'll send a reminder.",
  bookSuccessBtn: 'My bookings', bookErrorMsg: 'Could not create booking. Please try again.',
  listEyebrow: 'Personal', listH: 'My', listHi: 'bookings',
  listTabUpcoming: 'Upcoming', listTabHistory: 'History',
  listEmpty: 'No bookings yet', listBtnNew: 'Book',
  listCancelBtn: 'Cancel', listCancellingBtn: 'Cancelling...',
  listCancelConfirm: 'Cancel this booking?', listCancelError: 'Could not cancel booking',
  listLivePrefix: 'Live',
  listLiveDays: (n) => `in ${n} ${n === 1 ? 'day' : 'days'}`,
  listLiveHours: (n) => `in ${n}h`,
  listLiveSoon: 'soon',
  stConfirmed: 'Confirmed', stPending: 'Pending', stCancelled: 'Cancelled',
  stCompleted: 'Completed', stNoShow: 'No show',
  profEyebrow: 'Profile', profH: 'My', profHi: 'profile',
  profVisits: 'Visits', profFavorite: 'Favourite service',
  profLang: 'Interface language', profNotif: 'Notifications',
  profContact: 'Contact salon', profSignOut: 'Sign out',
  profHistory: 'Visit history',
};

const UK: AppTranslations = {
  tabHome: 'Головна', tabCatalog: 'Каталог', tabBookings: 'Записи', tabProfile: 'Профіль',
  back: 'Назад', continueBtn: 'Продовжити', loading: 'Завантаження...', noData: 'Немає даних',
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
  bookStep2: 'Крок 2 з 3', bookWhenH: 'Коли вам', bookWhenHi: 'зручно',
  bookFreeTime: 'Вільний час', bookSelectDate: 'Оберіть дату', bookNoSlots: 'Немає вільного часу', bookBtnNext: 'До підтвердження',
  bookStep3: 'Крок 3 з 3', bookConfirmH: 'Підтвердіть', bookConfirmHi: 'запис',
  bookSvcLabel: 'Послуга', bookMasterLabel: 'Майстер', bookDateTimeLabel: 'Дата і час',
  bookBtnConfirm: 'Підтвердити запис', bookBtnPending: 'Створюємо запис...',
  bookSuccessH: 'Запис', bookSuccessHi: 'створено', bookSuccessSub: 'Чекаємо вас! Нагадаємо про запис заздалегідь.',
  bookSuccessBtn: 'Мої записи', bookErrorMsg: 'Не вдалося створити запис. Спробуйте ще раз.',
  listEyebrow: 'Особисте', listH: 'Мої', listHi: 'записи',
  listTabUpcoming: 'Майбутні', listTabHistory: 'Минулі',
  listEmpty: 'Поки немає записів', listBtnNew: 'Записатись',
  listCancelBtn: 'Скасувати', listCancellingBtn: 'Скасовуємо...',
  listCancelConfirm: 'Скасувати запис?', listCancelError: 'Не вдалося скасувати запис',
  listLivePrefix: 'Live',
  listLiveDays: (n) => `через ${n} ${n === 1 ? 'день' : n < 5 ? 'дні' : 'днів'}`,
  listLiveHours: (n) => `через ${n} год`,
  listLiveSoon: 'скоро',
  stConfirmed: 'Підтверджено', stPending: 'Очікування', stCancelled: 'Скасовано',
  stCompleted: 'Завершено', stNoShow: 'Не прийшов',
  profEyebrow: 'Профіль', profH: 'Мій', profHi: 'профіль',
  profVisits: 'Візитів', profFavorite: 'Улюблена послуга',
  profLang: 'Мова інтерфейсу', profNotif: 'Сповіщення',
  profContact: "Зв'язатися із салоном", profSignOut: 'Вийти',
  profHistory: 'Історія візитів',
};

const BG: AppTranslations = {
  tabHome: 'Начало', tabCatalog: 'Каталог', tabBookings: 'Записи', tabProfile: 'Профил',
  back: 'Назад', continueBtn: 'Продължи', loading: 'Зареждане...', noData: 'Няма данни',
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
  bookStep2: 'Стъпка 2 от 3', bookWhenH: 'Кога ви е', bookWhenHi: 'удобно',
  bookFreeTime: 'Свободно време', bookSelectDate: 'Изберете дата', bookNoSlots: 'Няма свободно време', bookBtnNext: 'Към потвърждение',
  bookStep3: 'Стъпка 3 от 3', bookConfirmH: 'Потвърдете', bookConfirmHi: 'записа',
  bookSvcLabel: 'Услуга', bookMasterLabel: 'Майстор', bookDateTimeLabel: 'Дата и час',
  bookBtnConfirm: 'Потвърди записа', bookBtnPending: 'Създаваме запис...',
  bookSuccessH: 'Записът е', bookSuccessHi: 'създаден', bookSuccessSub: 'Очакваме ви! Ще ви напомним предварително.',
  bookSuccessBtn: 'Моите записи', bookErrorMsg: 'Неуспешно създаване. Моля, опитайте отново.',
  listEyebrow: 'Лично', listH: 'Моите', listHi: 'записи',
  listTabUpcoming: 'Предстоящи', listTabHistory: 'Минали',
  listEmpty: 'Засега няма записи', listBtnNew: 'Запиши се',
  listCancelBtn: 'Откажи', listCancellingBtn: 'Отказваме...',
  listCancelConfirm: 'Откажи записа?', listCancelError: 'Неуспешно отказване на записа',
  listLivePrefix: 'Live',
  listLiveDays: (n) => `след ${n} ${n === 1 ? 'ден' : 'дни'}`,
  listLiveHours: (n) => `след ${n} ч`,
  listLiveSoon: 'скоро',
  stConfirmed: 'Потвърдено', stPending: 'Изчакване', stCancelled: 'Отказано',
  stCompleted: 'Завършено', stNoShow: 'Не се яви',
  profEyebrow: 'Профил', profH: 'Моят', profHi: 'профил',
  profVisits: 'Посещения', profFavorite: 'Любима услуга',
  profLang: 'Език на интерфейса', profNotif: 'Известия',
  profContact: 'Свържете се с салона', profSignOut: 'Изход',
  profHistory: 'История на посещенията',
};

export const translations: Record<Lang, AppTranslations> = { ru: RU, en: EN, uk: UK, bg: BG };
