// Google Apps Script — единый код проекта «Антураж» (вставить в редактор script.google.com)
// Обрабатывает:
//   1) POST с сайта (форма заказа и заказ из распродажи)  — через doPost
//   2) Telegram-бот для сотрудников                        — через polling (getUpdates)
//
// ПОЧЕМУ POLLING, А НЕ WEBHOOK:
//   Apps Script как webhook отвечает Telegram медленно (через redirect), Telegram считает
//   доставку неудачной и бесконечно ретраит → шторм сообщений. Polling с offset обрабатывает
//   каждый апдейт ровно один раз, без ретраев и штормов. Отклик быстрый за счёт long polling.
//
// ПЕРВИЧНАЯ НАСТРОЙКА (один раз):
//   1. Вставить этот код, сохранить.
//   2. В редакторе выбрать функцию setupBot → Run. Согласиться с запросом прав.
//      (создаст лист «Доступ», уберёт webhook, запустит polling-триггер раз в минуту)
//   3. Написать боту /start.
//
//   Web App деплой нужен ТОЛЬКО для приёма заказов с сайта (форма, распродажа).
//   Для бота деплой и публичный доступ больше не требуются.
//
// УПРАВЛЕНИЕ:
//   stopPolling()  — остановить бота
//   startPolling() — запустить заново

const SPREADSHEET_ID = '1KTcO1ZiYbZkCjNT946i9fNYEFMMaaEWYSGQpiRZj8PY';
const SHEET_NAME = 'Заказы';
const SALE_SHEET_NAME = 'Распродажа';
const ACCESS_SHEET_NAME = 'Доступ';
const TELEGRAM_BOT_TOKEN = '8290114084:AAGSkpMYKtkveWx4im25BrNJBtl1X6W-VKg';
const LAST_ROW_KEY = 'lastProcessedRow';
const OFFSET_KEY = 'tg_offset';

// Резервный список доступа, если лист «Доступ» ещё не создан или пуст
const FALLBACK_CHAT_IDS = ['1004344765', '7221249885'];

// Конфигурация двух разделов бота.
// Колонки задаются ИМЕНАМИ заголовков (не номерами) — перестановка столбцов ничего не ломает.
const SECTIONS = {
  o: {
    key: 'o',
    sheetName: SHEET_NAME,
    title: 'Заказ',
    emoji: '📋',
    listTitle: '📋 Список активных заказов',
    nameCol: 'ФИО',
    priceCol: 'Цена',
    imageCol: 'Изображение',
    statusCol: 'Статус',
    commentCol: 'Примечания',
    defaultStatus: 'В работе',           // пустой статус считаем «В работе»
    active: ['В работе'],
    done: ['Выполнено', 'Отменено'],
    transitions: {
      'В работе': [['✅ Выполнен', 'Выполнено'], ['❌ Отменить', 'Отменено']],
    },
  },
  s: {
    key: 's',
    sheetName: SALE_SHEET_NAME,
    title: 'Товар распродажи',
    emoji: '🛒',
    listTitle: '🛒 Список заказов распродажи',
    nameCol: 'Название',
    priceCol: 'Новая цена',
    imageCol: 'Изображение',
    statusCol: 'Статус',
    commentCol: 'Примечания',
    defaultStatus: '',                   // товары «В продаже» — не заказы, в бот не попадают
    active: ['Заказано', 'Отправлен'],
    done: ['Выполнен', 'Отменено'],
    transitions: {
      'Заказано': [['📦 Отправлен', 'Отправлен'], ['❌ Отменить', 'Отменено']],
      'Отправлен': [['✅ Выполнен', 'Выполнен'], ['❌ Отменить', 'Отменено']],
    },
  },
};

// Раскладка карточки заказа: группы полей + суффиксы единиц (как в старом bot.js).
// Колонки ищутся по имени; отсутствующие/пустые пропускаются. Работает для обоих листов.
const CARD_LAYOUT = [
  { title: '📌 Основная информация', cols: [
    ['Дата', ''], ['Цена', ' руб.'], ['Новая цена', ' руб.'], ['Старая цена', ' руб.'],
    ['Носитель', ''], ['Тип', ''], ['Длина', ' см'], ['Высота', ' см'],
  ] },
  { title: '🎨 Материалы', cols: [
    ['Тип носителя', ''], ['Тип холста', ''], ['Тип натяжки', ''], ['Багет', ''],
    ['Тип рулона', ''], ['Тип обоев', ''], ['Текстура', ''], ['Ламинация', ''],
  ] },
  { title: '👤 Клиент', cols: [
    ['ФИО', ''], ['Телефон', ''], ['Город', ''], ['Адрес', ''], ['Индекс', ''],
  ] },
  { title: '🖼 Детали картины', cols: [
    ['Название', ''], ['Автор', ''],
  ] },
  { title: '📝 Примечания и статус', cols: [
    ['Примечания', ''], ['Статус', ''],
  ] },
];

// ============================================================================
//  ВХОДНЫЕ ТОЧКИ (приём заказов с сайта)
// ============================================================================

// ContentService.TextOutput не умеет задавать заголовки (нет .setHeader) — попытка кидает
// TypeError. CORS-заголовки через ContentService невозможны в принципе; сайт шлёт запросы
// в режиме no-cors (simple request), поэтому preflight не отправляется и doOptions фактически
// не вызывается. Оставляем пустой валидный ответ, чтобы ничего не падало.
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.saleOrder) return handleSaleOrder(data.saleOrder);
    return handleSiteOrder(data.formDataSorted);
  } catch (error) {
    Logger.log('Ошибка в doPost: ' + error.message + ' | ' + error.stack);
    return jsonOut({ status: 'error', message: error.message });
  }
}

function handleSiteOrder(formDataSorted) {
  formDataSorted.push('');          // Примечания
  formDataSorted.push('В работе');  // Статус

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Лист «' + SHEET_NAME + '» не найден');

  sheet.appendRow(formDataSorted);

  // Лист больше не сортируется → новый заказ всегда последняя строка, номер строки стабилен.
  const rowNumber = sheet.getLastRow();

  invalidateSection('o'); // сбрасываем кэш, чтобы уведомление и список увидели новый заказ
  notifyNewOrder('o', rowNumber);
  PropertiesService.getScriptProperties().setProperty(LAST_ROW_KEY, rowNumber);

  return jsonOut({ status: 'success' });
}

function handleSaleOrder(order) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SALE_SHEET_NAME);
    if (!sheet) throw new Error('Лист «' + SALE_SHEET_NAME + '» не найден');

    const rowNumber = Number(order.rowId) + 2; // строка 1 — заголовки
    if (rowNumber < 2 || rowNumber > sheet.getLastRow()) {
      throw new Error('Некорректный номер строки: ' + rowNumber);
    }

    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const col = name => header.indexOf(name) + 1; // 1-based; 0 если не найдено
    const statusCol = col('Статус');

    if (statusCol && sheet.getRange(rowNumber, statusCol).getValue() === 'Заказано') {
      return jsonOut({ status: 'already_ordered' });
    }

    const formatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
    const writes = {
      'Дата': formatted, 'ФИО': order.fullName, 'Телефон': order.phone,
      'Город': order.city, 'Адрес': order.address, 'Индекс': order.index, 'Статус': 'Заказано',
    };
    Object.keys(writes).forEach(name => {
      const c = col(name);
      if (c) sheet.getRange(rowNumber, c).setValue(writes[name]);
    });

    invalidateSection('s');
    notifyNewOrder('s', rowNumber);
    return jsonOut({ status: 'success' });
  } catch (error) {
    Logger.log('Ошибка в handleSaleOrder: ' + error.message);
    return jsonOut({ status: 'error', message: error.message });
  }
}

// ============================================================================
//  УВЕДОМЛЕНИЯ О НОВЫХ ЗАКАЗАХ
// ============================================================================

function notifyNewOrder(key, rowNumber) {
  try {
    const s = readSection(key);
    const row = s.values[rowNumber - 1];
    if (!row) return;

    const displayNo = rowNumber;
    const name = cell(row, s, s.cfg.nameCol) || 'Не указано';
    const price = cell(row, s, s.cfg.priceCol);
    const date = fmtVal(cell(row, s, 'Дата')) || '';
    const title = key === 's' ? '🛒 *Пришёл новый заказ из распродажи' : '🔔 *Пришёл новый заказ';

    // Стиль уведомления — как в старом bot.js (Markdown, краткая сводка)
    let text = title + ' #' + displayNo + '!*\n\n';
    if (date) text += '📅 Дата: ' + date + '\n';
    text += '👤 ФИО: ' + name + '\n';
    text += '💰 Цена: ' + (price ? price + ' руб.' : 'Не указана');

    const img = cell(row, s, s.cfg.imageCol);
    const keyboard = { inline_keyboard: [[{ text: '📂 Открыть заказ', callback_data: 'op:' + key + ':' + rowNumber }]] };

    getAllowedChatIds().forEach(chatId => {
      if (img && isValidUrl(img)) tgPhoto(chatId, img, text, keyboard);
      else tgSend(chatId, text, keyboard);
    });
  } catch (error) {
    Logger.log('Ошибка notifyNewOrder: ' + error.message);
  }
}

// Резервная проверка: ловит заказы, вписанные руками прямо в таблицу.
function checkNewOrders() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const lastProcessed = Number(PropertiesService.getScriptProperties().getProperty(LAST_ROW_KEY)) || 1;
  if (lastRow > lastProcessed) {
    for (let r = lastProcessed + 1; r <= lastRow; r++) {
      const first = sheet.getRange(r, 1).getValue();
      if (first && first !== 'Удалено') notifyNewOrder('o', r);
    }
    PropertiesService.getScriptProperties().setProperty(LAST_ROW_KEY, lastRow);
  }
}

// ============================================================================
//  POLLING — приём апдейтов от Telegram
// ============================================================================

// Запускается триггером раз в минуту. Внутри крутит long polling ~55 сек,
// поэтому отклик на действия — 1-3 секунды, без штормов и ретраев.
function pollUpdates() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(500)) return; // другой запуск ещё активен — выходим
  try {
    const props = PropertiesService.getScriptProperties();
    const deadline = Date.now() + 55000;
    while (Date.now() < deadline) {
      const offset = Number(props.getProperty(OFFSET_KEY)) || 0;
      let resp;
      try {
        resp = tgApi('getUpdates', { offset: offset, timeout: 25 });
      } catch (e) {
        Logger.log('getUpdates error: ' + e.message);
        break;
      }
      if (!resp || !resp.ok) break;
      const updates = resp.result || [];
      if (!updates.length) continue; // long-poll истёк без апдейтов — продолжаем
      updates.forEach(u => {
        try {
          handleTelegramUpdate(u);
        } catch (e) {
          Logger.log('Ошибка апдейта ' + u.update_id + ': ' + e.message);
        }
      });
      // offset двигаем ПОСЛЕ обработки — каждый апдейт ровно один раз.
      // Даже если апдейт упал, offset двигается → не зацикливаемся на «ядовитом».
      props.setProperty(OFFSET_KEY, String(updates[updates.length - 1].update_id + 1));
    }
  } finally {
    lock.releaseLock();
  }
}

function handleTelegramUpdate(update) {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message) return handleMessage(update.message);
}

// ============================================================================
//  TELEGRAM-БОТ: сообщения и команды
// ============================================================================

function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  if (text === '/myid') {
    tgSend(chatId, 'Ваш Chat ID: <code>' + chatId + '</code>');
    return;
  }

  if (!isAllowed(chatId)) {
    tgSend(chatId, '❌ Доступа нет.\nВаш Chat ID: <code>' + chatId + '</code>\nПередайте его владельцу, чтобы он добавил вас в лист «Доступ».');
    return;
  }

  // Ожидаем ввод поискового запроса?
  if (getPendingSearch(chatId) && text && !text.startsWith('/')) {
    clearPendingSearch(chatId);
    // Результат — новым сообщением (не правим прошлое), чтобы запрос и выдача оставались в истории.
    const screen = searchScreen(text);
    setLastMsg(chatId, msgId(tgSend(chatId, screen.text, screen.keyboard)), false);
    return;
  }

  // Ожидаем ввод комментария?
  const pending = getPendingComment(chatId);
  if (pending && text && !text.startsWith('/')) {
    saveComment(chatId, pending.key, pending.row, text);
    return;
  }

  sendMenu(chatId); // /start и любой другой ввод → меню
}

function handleCallback(query) {
  const chatId = query.message.chat.id;
  const parts = query.data.split(':'); // op:o:5 | ls:o:active:1 | st:o:5:Выполнено | ...
  const action = parts[0];

  if (!isAllowed(chatId)) {
    tgAnswer(query.id, '❌ Доступа нет');
    return;
  }

  switch (action) {
    case 'menu':
      respond(query, menuScreen());
      break;
    case 'stats':
      respond(query, { text: statsText(), keyboard: backKeyboard() });
      break;
    case 'help':
      respond(query, helpScreen());
      break;
    case 'search': // запрос ввода поисковой строки
      setPendingSearch(chatId);
      respond(query, searchPromptScreen());
      break;
    case 'search_cancel':
      clearPendingSearch(chatId);
      respond(query, menuScreen());
      break;
    case 'ls': // ls:<key>:<mode>:<page>
      respond(query, listScreen(parts[1], parts[2], Number(parts[3])));
      break;
    case 'op': // op:<key>:<row>
      respond(query, cardScreen(parts[1], Number(parts[2])));
      break;
    case 'st': // st:<key>:<row>:<to> — запрос подтверждения
      respond(query, confirmScreen(parts[1], Number(parts[2]), parts[3]));
      break;
    case 'ok': // ok:<key>:<row>:<to> — подтверждено
      applyStatus(parts[1], Number(parts[2]), parts[3]);
      tgAnswer(query.id, 'Статус обновлён');
      if (parts[1] === 'o') {
        respond(query, listScreen('o', 'active', 1)); // заказ ушёл из активных → к списку активных
      } else {
        respond(query, cardScreen(parts[1], Number(parts[2]))); // распродажа остаётся в карточке
      }
      return;
    case 'cm': // cm:<key>:<row> — начать ввод комментария
      setPendingComment(chatId, parts[1], Number(parts[2]));
      respond(query, commentPromptScreen(parts[1], Number(parts[2])));
      break;
    case 'cm_cancel':
      clearPendingComment(chatId);
      respond(query, cardScreen(parts[1], Number(parts[2])));
      break;
  }
  tgAnswer(query.id);
}

// ============================================================================
//  ЭКРАНЫ БОТА (возвращают { text, photo?, keyboard })
// ============================================================================

function menuScreen() {
  return {
    text: '👋 <b>Главное меню</b>\nВыберите раздел:',
    keyboard: {
      inline_keyboard: [
        [{ text: '📋 Активные заказы', callback_data: 'ls:o:active:1' }],
        [{ text: '🛒 Распродажа', callback_data: 'ls:s:active:1' }],
        [{ text: '🔍 Поиск заказа', callback_data: 'search' }],
        [{ text: '📊 Статистика', callback_data: 'stats' }],
        [{ text: '❓ Помощь', callback_data: 'help' }],
      ],
    },
  };
}

function sendMenu(chatId) {
  // На текстовую команду (/start и любой ввод) отвечаем НОВЫМ сообщением внизу чата.
  // Если редактировать старое «живое» сообщение на месте, правка уезжает вверх по истории
  // и выглядит как «бот не ответил». Старое сообщение убираем, чтобы не плодить меню.
  const last = getLastMsg(chatId);
  if (last) tgDelete(chatId, last.id);
  const screen = menuScreen();
  setLastMsg(chatId, msgId(tgSend(chatId, screen.text, screen.keyboard)), false);
}

function listScreen(key, mode, page) {
  const s = readSection(key);
  const cfg = s.cfg;
  const items = collectItems(s, mode);
  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  page = Math.min(Math.max(1, page || 1), totalPages);

  const isActive = mode === 'active';
  const heading = isActive ? cfg.listTitle : cfg.emoji + ' 📁 История';

  if (items.length === 0) {
    return {
      text: '<b>' + heading + '</b>\n\n' + (isActive ? '😌 Активных заказов нет.' : '📭 История пуста.'),
      keyboard: { inline_keyboard: listFooter(key, mode, page, totalPages, isActive) },
    };
  }

  const start = (page - 1) * perPage;
  const pageItems = items.slice(start, start + perPage);

  // Текстовые блоки в стиле старого bot.js
  let text = '<b>' + heading + '</b> 📦 (Страница ' + page + '/' + totalPages + ')\n\n';
  const buttons = [];
  pageItems.forEach((it, idx) => {
    const seqNo = start + idx + 1;   // условный номер 1…N в пределах списка
    const rowNo = it.rowNumber;      // номер строки в таблице (стабильный, для поиска заказа)
    const date = fmtVal(cell(it.row, s, 'Дата')) || 'Не указано';
    const name = cell(it.row, s, cfg.nameCol) || 'Не указано';
    const price = cell(it.row, s, cfg.priceCol);
    text += '📦 <b>' + cfg.title + ' №' + seqNo + '</b> · строка ' + rowNo + '\n' +
            '📅 Дата: ' + esc(date) + '\n' +
            '👤 ' + esc(cfg.nameCol) + ': ' + esc(name) + '\n' +
            '💰 Цена: ' + (price ? esc(price) + ' руб.' : 'Не указана') + '\n' +
            '📌 Статус: ' + esc(it.status) + '\n\n';
    buttons.push([{ text: '📦 ' + cfg.title + ' №' + seqNo + ' (строка ' + rowNo + ')', callback_data: 'op:' + key + ':' + rowNo }]);
  });

  return {
    text: cut(text, 3800),
    keyboard: { inline_keyboard: buttons.concat(listFooter(key, mode, page, totalPages, isActive)) },
  };
}

function listFooter(key, mode, page, totalPages, isActive) {
  const nav = [];
  if (page > 1) nav.push({ text: '◀️ Предыдущая', callback_data: 'ls:' + key + ':' + mode + ':' + (page - 1) });
  if (page < totalPages) nav.push({ text: 'Следующая ▶️', callback_data: 'ls:' + key + ':' + mode + ':' + (page + 1) });

  const rows = [];
  if (nav.length) rows.push(nav);
  rows.push([
    isActive
      ? { text: '📁 История', callback_data: 'ls:' + key + ':done:1' }
      : { text: '📋 Активные', callback_data: 'ls:' + key + ':active:1' },
    { text: '🔄 Обновить', callback_data: 'ls:' + key + ':' + mode + ':' + page },
  ]);
  rows.push([{ text: '🏠 Главное меню', callback_data: 'menu' }]);
  return rows;
}

function cardScreen(key, rowNumber) {
  const s = readRow(key, rowNumber); // быстрое чтение одной строки
  const cfg = s.cfg;
  const row = s.row;

  if (!row || !isValidRow(row)) {
    return { text: '❌ Заказ не найден, удалён или завершён.', keyboard: backKeyboard() };
  }

  const status = statusOf(row, s);

  // В заголовке карточки — номер строки в таблице (стабильный идентификатор заказа).
  let text = cfg.emoji + ' <b>' + cfg.title + '</b> · строка ' + rowNumber + '\n';
  CARD_LAYOUT.forEach(group => {
    const lines = [];
    group.cols.forEach(pair => {
      const colName = pair[0], suffix = pair[1];
      const i = s.header.indexOf(colName);
      if (i < 0) return;
      let v = row[i];
      const isComment = colName === cfg.commentCol;
      const empty = v === '' || v === null || v === undefined || String(v).trim() === '-';
      if (empty && !isComment) return;          // прочерки/пустые скрываем…
      if (empty && isComment) v = '—';           // …кроме примечания — его показываем всегда
      lines.push('• ' + colName + ': ' + esc(fmtVal(v)) + suffix);
    });
    // Ссылка на изображение — отдельной строкой в секции картины (помимо самого фото)
    if (group.title === '🖼 Детали картины') {
      const img = cell(row, s, cfg.imageCol);
      if (img && isValidUrl(img)) lines.push('• Картина: <a href="' + encodeURI(img) + '">Открыть фото</a>');
    }
    if (lines.length) text += '\n<b>' + group.title + '</b>\n' + lines.join('\n') + '\n';
  });

  const img = cell(row, s, cfg.imageCol);
  return {
    text: cut(text, 3800),
    photo: (img && isValidUrl(img)) ? img : null,
    keyboard: cardKeyboard(cfg, status, rowNumber, sheetRowUrl(s.sheet, rowNumber)),
  };
}

function cardKeyboard(cfg, status, rowNumber, sheetUrl) {
  const rows = [];
  const trans = cfg.transitions[status];
  if (trans) trans.forEach(t => rows.push([{ text: t[0], callback_data: 'st:' + cfg.key + ':' + rowNumber + ':' + t[1] }]));
  rows.push([{ text: '📝 Добавить примечание', callback_data: 'cm:' + cfg.key + ':' + rowNumber }]);
  if (sheetUrl) rows.push([{ text: '📄 Открыть строку в таблице', url: sheetUrl }]);
  rows.push([
    { text: '🔙 Назад к списку', callback_data: 'ls:' + cfg.key + ':active:1' },
    { text: '🏠 Главное меню', callback_data: 'menu' },
  ]);
  return { inline_keyboard: rows };
}

// Deep-link на строку в Google Sheets: открывает таблицу с выделенной строкой.
function sheetRowUrl(sheet, rowNumber) {
  const gid = sheet.getSheetId();
  return 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID +
         '/edit#gid=' + gid + '&range=' + rowNumber + ':' + rowNumber;
}

function confirmScreen(key, rowNumber, to) {
  const displayNo = rowNumber;
  return {
    text: '❓ Точно изменить статус заказа №' + displayNo + ' на «' + esc(to) + '»?',
    keyboard: {
      inline_keyboard: [[
        { text: '✅ Да', callback_data: 'ok:' + key + ':' + rowNumber + ':' + to },
        { text: '↩️ Нет', callback_data: 'op:' + key + ':' + rowNumber },
      ]],
    },
  };
}

function commentPromptScreen(key, rowNumber) {
  const displayNo = rowNumber;
  return {
    text: '💬 Отправьте текст примечания к заказу №' + displayNo + ' одним сообщением.',
    keyboard: { inline_keyboard: [[{ text: '↩️ Отмена', callback_data: 'cm_cancel:' + key + ':' + rowNumber }]] },
  };
}

function statsText() {
  let text = '📊 <b>Статистика заказов</b> 📈\n';
  ['o', 's'].forEach(key => {
    const s = readSection(key);
    const cfg = s.cfg;
    const known = cfg.active.concat(cfg.done);
    const counts = {};
    let activeSum = 0;
    for (let i = 1; i < s.values.length; i++) {
      const row = s.values[i];
      if (!isValidRow(row)) continue;
      const st = statusOf(row, s);
      if (known.indexOf(st) < 0) continue;
      counts[st] = (counts[st] || 0) + 1;
      if (cfg.active.indexOf(st) >= 0) activeSum += parseNumber(cell(row, s, cfg.priceCol));
    }
    text += '\n<b>' + cfg.emoji + ' ' + cfg.sheetName + '</b>\n';
    known.forEach(st => { text += '• ' + st + ': ' + (counts[st] || 0) + '\n'; });
    text += '💰 Сумма активных: ' + activeSum.toLocaleString('ru-RU') + ' руб.\n';
  });
  return text;
}

function backKeyboard() {
  return { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'menu' }]] };
}

function searchPromptScreen() {
  return {
    text: '🔍 <b>Поиск заказа</b>\nОтправьте ФИО, телефон или номер строки одним сообщением.',
    keyboard: { inline_keyboard: [[{ text: '↩️ Отмена', callback_data: 'search_cancel' }]] },
  };
}

// Ищет среди активных заказов обоих разделов по подстроке в ФИО/телефоне или по номеру строки.
// Идём по collectItems(active) — та же выборка и нумерация (№), что и в списке заказов.
function searchScreen(queryText) {
  const q = String(queryText).trim().toLowerCase();
  const buttons = [];
  let found = 0;

  ['o', 's'].forEach(key => {
    const s = readSection(key);
    const cfg = s.cfg;
    const items = collectItems(s, 'active');
    for (let i = 0; i < items.length && found < 20; i++) {
      const it = items[i];
      const seqNo = i + 1;        // условный номер заказа в списке (1…N)
      const rowNo = it.rowNumber; // номер строки в таблице — по нему и ищем
      const name = String(cell(it.row, s, cfg.nameCol) || '').toLowerCase();
      const phone = String(cell(it.row, s, 'Телефон') || '').toLowerCase();
      if (name.indexOf(q) >= 0 || phone.indexOf(q) >= 0 || String(rowNo) === q) {
        const label = cfg.emoji + ' ' + cfg.title + ' №' + seqNo + ' (строка ' + rowNo + ') · ' +
                      (cell(it.row, s, cfg.nameCol) || '—');
        buttons.push([{ text: cut(label, 60), callback_data: 'op:' + key + ':' + rowNo }]);
        found++;
      }
    }
  });

  if (found === 0) {
    return { text: '🔍 По запросу «' + esc(queryText) + '» ничего не найдено.', keyboard: backKeyboard() };
  }
  return {
    text: '🔍 Найдено: <b>' + found + '</b>' + (found >= 20 ? ' (показаны первые 20)' : ''),
    keyboard: { inline_keyboard: buttons.concat([[{ text: '🏠 Главное меню', callback_data: 'menu' }]]) },
  };
}

function helpScreen() {
  const text =
    '❓ <b>Как пользоваться ботом</b>\n\n' +
    '📋 <b>Активные заказы</b> — заказы в работе. Нажмите на заказ, чтобы открыть карточку.\n' +
    '🛒 <b>Распродажа</b> — заказы готовых товаров.\n\n' +
    'В карточке заказа:\n' +
    '• ✅/❌/📦 — сменить статус (с подтверждением)\n' +
    '• 📝 — добавить примечание\n' +
    '• 📄 — открыть строку в Google-таблице\n\n' +
    '🔍 <b>Поиск</b> — найти заказ по ФИО, телефону или номеру строки.\n' +
    '📊 <b>Статистика</b> — количество и суммы заказов.\n' +
    '📁 <b>История</b> (внутри списка) — завершённые заказы.\n\n' +
    'Нет доступа? Отправьте /myid и передайте свой ID руководителю.';
  return { text: text, keyboard: backKeyboard() };
}

// ============================================================================
//  ЗАПИСЬ В ТАБЛИЦУ (с блокировкой от одновременных правок)
// ============================================================================

function applyStatus(key, rowNumber, to) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const s = readRow(key, rowNumber);
    const cfg = s.cfg;
    if (!s.row || !isValidRow(s.row)) return;

    const status = statusOf(s.row, s);
    const allowed = cfg.transitions[status];
    if (!allowed || !allowed.some(t => t[1] === to)) return; // уже изменён — не трогаем

    const colIdx = s.header.indexOf(cfg.statusCol);
    if (colIdx < 0) return;
    s.sheet.getRange(rowNumber, colIdx + 1).setValue(to);
    invalidateSection(key);
  } finally {
    lock.releaseLock();
  }
}

function saveComment(chatId, key, rowNumber, text) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const s = readRow(key, rowNumber);
    const colIdx = s.header.indexOf(s.cfg.commentCol);
    if (colIdx >= 0) s.sheet.getRange(rowNumber, colIdx + 1).setValue(text);
    invalidateSection(key);
  } finally {
    lock.releaseLock();
  }
  clearPendingComment(chatId);
  const card = cardScreen(key, rowNumber);
  card.text = '✅ Примечание сохранено.\n\n' + card.text;
  showScreen(chatId, card);
}

// ============================================================================
//  СОСТОЯНИЕ ВВОДА КОММЕНТАРИЯ (CacheService по chatId)
// ============================================================================

function setPendingComment(chatId, key, rowNumber) {
  CacheService.getScriptCache().put('cmt_' + chatId, key + ':' + rowNumber, 600);
}
function getPendingComment(chatId) {
  const v = CacheService.getScriptCache().get('cmt_' + chatId);
  if (!v) return null;
  const p = v.split(':');
  return { key: p[0], row: Number(p[1]) };
}
function clearPendingComment(chatId) {
  CacheService.getScriptCache().remove('cmt_' + chatId);
}

function setPendingSearch(chatId) {
  CacheService.getScriptCache().put('srch_' + chatId, '1', 600);
}
function getPendingSearch(chatId) {
  return !!CacheService.getScriptCache().get('srch_' + chatId);
}
function clearPendingSearch(chatId) {
  CacheService.getScriptCache().remove('srch_' + chatId);
}

// ============================================================================
//  ДОСТУП (лист «Доступ»)
// ============================================================================

function getAllowedChatIds() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ACCESS_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return FALLBACK_CHAT_IDS;
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idIdx = header.indexOf('Chat ID');
    if (idIdx < 0) return FALLBACK_CHAT_IDS;
    const ids = sheet.getRange(2, idIdx + 1, sheet.getLastRow() - 1, 1).getValues()
      .map(r => String(r[0]).trim()).filter(Boolean);
    return ids.length ? ids : FALLBACK_CHAT_IDS;
  } catch (e) {
    return FALLBACK_CHAT_IDS;
  }
}

function isAllowed(chatId) {
  return getAllowedChatIds().indexOf(String(chatId)) >= 0;
}

// ============================================================================
//  ЧТЕНИЕ ЛИСТОВ
// ============================================================================

// Читает раздел целиком: { cfg, sheet, header[], values[][] }. Нужен для списков/статистики.
// Кэшируется в CacheService на 30 сек — пагинация, «назад к списку», поиск не перечитывают таблицу.
// sheet=null на попадании в кэш (чтение раздела нигде не пишет; для записи есть readRow).
function readSection(key) {
  const cfg = SECTIONS[key];
  const cache = CacheService.getScriptCache();
  const cached = cache.get('sheet_' + key);
  if (cached) {
    try {
      const o = JSON.parse(cached);
      return { cfg, sheet: null, header: o.header, values: o.values };
    } catch (e) { /* битый кэш — читаем заново */ }
  }
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(cfg.sheetName);
  if (!sheet) throw new Error('Лист «' + cfg.sheetName + '» не найден');
  const values = sheet.getDataRange().getValues();
  // Date → строка: и для отображения, и чтобы корректно пережить JSON-кэш
  for (const row of values) {
    for (let i = 0; i < row.length; i++) if (row[i] instanceof Date) row[i] = fmtVal(row[i]);
  }
  const header = (values[0] || []).map(h => String(h).trim());
  try { cache.put('sheet_' + key, JSON.stringify({ header: header, values: values }), 30); } catch (e) { /* не влезло — работаем без кэша */ }
  return { cfg, sheet, header, values };
}

// Сбрасывает кэш раздела — вызывать после любой записи в лист.
function invalidateSection(key) {
  CacheService.getScriptCache().remove('sheet_' + key);
}

// Быстрое чтение ОДНОЙ строки (заголовок + строка) — для карточки, статуса, комментария.
// Возвращает { cfg, sheet, header[], row[] }; row = null если строки нет.
function readRow(key, rowNumber) {
  const cfg = SECTIONS[key];
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(cfg.sheetName);
  if (!sheet) throw new Error('Лист «' + cfg.sheetName + '» не найден');
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) return { cfg, sheet, header, row: null };
  const row = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
  return { cfg, sheet, header, row };
}

function cell(row, s, colName) {
  const i = s.header.indexOf(colName);
  return i >= 0 ? row[i] : '';
}

function statusOf(row, s) {
  let st = String(cell(row, s, s.cfg.statusCol) || '').trim();
  if (!st && s.cfg.defaultStatus) st = s.cfg.defaultStatus;
  return st;
}

function isValidRow(row) {
  const first = row[0];
  return first && first !== 'Удалено' && row.some(c => c !== '' && c !== 'Удалено');
}

function collectItems(s, mode) {
  const cfg = s.cfg;
  const list = mode === 'done' ? cfg.done : cfg.active;
  const items = [];
  for (let i = 1; i < s.values.length; i++) {
    const row = s.values[i];
    if (!isValidRow(row)) continue;
    const st = statusOf(row, s);
    if (list.indexOf(st) >= 0) items.push({ rowNumber: i + 1, row: row, status: st });
  }
  return items;
}

// ============================================================================
//  TELEGRAM API
// ============================================================================

function tgApi(method, payload) {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/' + method;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  return JSON.parse(res.getContentText());
}

function tgSend(chatId, text, keyboard) {
  return tgApi('sendMessage', {
    chat_id: chatId, text: text, parse_mode: 'HTML',
    disable_web_page_preview: true, reply_markup: keyboard,
  });
}

function tgPhoto(chatId, photoUrl, caption, keyboard) {
  const r = tgApi('sendPhoto', {
    chat_id: chatId, photo: photoUrl, caption: cut(caption, 1024),
    parse_mode: 'HTML', reply_markup: keyboard,
  });
  if (!r.ok) return tgSend(chatId, caption, keyboard); // битый URL (напр. localhost) → шлём текстом
  return r;
}

function tgDelete(chatId, messageId) {
  tgApi('deleteMessage', { chat_id: chatId, message_id: messageId });
}

function tgAnswer(callbackId, text) {
  tgApi('answerCallbackQuery', { callback_query_id: callbackId, text: text || '' });
}

// ID и тип (фото/текст) ответа из результата Telegram API
function msgId(r) {
  return r && r.ok && r.result ? r.result.message_id : null;
}

// Запоминаем «живое» сообщение бота по chatId, чтобы редактировать его, а не плодить новые.
function setLastMsg(chatId, id, isPhoto) {
  if (id) CacheService.getScriptCache().put('last_' + chatId, id + ':' + (isPhoto ? '1' : '0'), 21600);
}
function getLastMsg(chatId) {
  const v = CacheService.getScriptCache().get('last_' + chatId);
  if (!v) return null;
  const p = v.split(':');
  return { id: Number(p[0]), isPhoto: p[1] === '1' };
}

// Показывает экран, заменяя предыдущее сообщение бота (а не отправляя новое).
function showScreen(chatId, screen) {
  const last = getLastMsg(chatId);

  if (screen.photo) {
    // Нужно фото: текст в фото редактированием не превратить → пересоздаём
    if (last) tgDelete(chatId, last.id);
    const r = tgPhoto(chatId, screen.photo, screen.text, screen.keyboard);
    setLastMsg(chatId, msgId(r), true);
  } else if (last && !last.isPhoto) {
    // Текст → текст: правим на месте
    const r = tgApi('editMessageText', {
      chat_id: chatId, message_id: last.id, text: screen.text,
      parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: screen.keyboard,
    });
    if (r.ok || (r.description && r.description.indexOf('message is not modified') >= 0)) {
      // r.ok — обновили на месте; «message is not modified» — содержимое и так актуально
      // (напр. «🔄 Обновить» без новых данных). В обоих случаях оставляем текущее сообщение
      // и НЕ шлём новое — иначе кнопка «Обновить» плодила бы дубли.
      setLastMsg(chatId, last.id, false);
    } else {
      // Редактирование не удалось (сообщение слишком старое/удалено/сбой) — чтобы не было
      // дубля, удаляем старое и шлём новое: это замена, а не добавление.
      tgDelete(chatId, last.id);
      setLastMsg(chatId, msgId(tgSend(chatId, screen.text, screen.keyboard)), false);
    }
  } else {
    // Прошлое было фото (или сообщения ещё нет) → пересоздаём текстом
    if (last && last.isPhoto) tgDelete(chatId, last.id);
    setLastMsg(chatId, msgId(tgSend(chatId, screen.text, screen.keyboard)), false);
  }
}

// Ответ на нажатие кнопки: «переселяем» живое сообщение в то, на котором нажали, и рендерим.
function respond(query, screen) {
  const m = query.message;
  const chatId = m.chat.id;
  setLastMsg(chatId, m.message_id, !!(m.photo && m.photo.length));
  showScreen(chatId, screen);
}

// ============================================================================
//  УТИЛИТЫ
// ============================================================================

// .setHeader на TextOutput недоступен (см. doOptions) — раньше тут был лишний вызов,
// который кидал TypeError при формировании ответа. Возвращаем чистый JSON.
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cut(str, max) {
  str = String(str);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function isValidUrl(url) {
  return /^https?:\/\/.+/i.test(String(url));
}

// Короткий формат даты: объект Date → "30.09.2025 16:31"; остальное — без изменений.
function fmtVal(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
  return v;
}

// Парсит цену из любого формата: число, "12400", "12 400", "12 400,50 ₽" → 12400.5
function parseNumber(v) {
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ============================================================================
//  НАСТРОЙКА И УПРАВЛЕНИЕ (запускать вручную из редактора)
// ============================================================================

// Главная функция настройки — запусти один раз. Идемпотентна, можно перезапускать.
function setupBot() {
  ensureAccessSheet();
  setBotCommands();
  startPolling();
  Logger.log('Готово. Бот работает в режиме polling (триггер pollUpdates раз в минуту).');
}

// Запускает polling: убирает webhook, чистит старую очередь, ставит триггер.
function startPolling() {
  stopPolling();

  // Webhook и getUpdates взаимоисключающи — снимаем webhook.
  tgApi('deleteWebhook', { drop_pending_updates: false });

  // Сбрасываем backlog: подтверждаем все старые апдейты, начинаем с чистого листа.
  const r = tgApi('getUpdates', { offset: -1 });
  let offset = 0;
  if (r.ok && r.result.length) offset = r.result[r.result.length - 1].update_id + 1;
  PropertiesService.getScriptProperties().setProperty(OFFSET_KEY, String(offset));

  ScriptApp.newTrigger('pollUpdates').timeBased().everyMinutes(1).create();
  Logger.log('Polling запущен. offset = ' + offset);
}

// Останавливает бота: удаляет ВСЕ триггеры проекта.
// Намеренно сносим всё — чтобы исключить лишние/дублирующие триггеры (в т.ч. старый
// checkNewOrders), которые слали «самопроизвольные» сообщения. startPolling потом
// создаёт ровно один pollUpdates.
function stopPolling() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
}

function setBotCommands() {
  tgApi('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть меню' },
      { command: 'myid', description: 'Узнать свой Chat ID' },
    ],
  });
}

// Создаёт лист «Доступ» с текущими сотрудниками, если его ещё нет
function ensureAccessSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (ss.getSheetByName(ACCESS_SHEET_NAME)) return;
  const sheet = ss.insertSheet(ACCESS_SHEET_NAME);
  sheet.getRange(1, 1, 1, 3).setValues([['Chat ID', 'Имя', 'Роль']]);
  FALLBACK_CHAT_IDS.forEach((id, i) => {
    sheet.getRange(i + 2, 1, 1, 3).setValues([[id, 'Сотрудник ' + (i + 1), i === 0 ? 'админ' : 'сотрудник']]);
  });
}

// Резервный триггер проверки заказов, вписанных вручную (необязательно).
function setupTrigger() {
  ScriptApp.newTrigger('checkNewOrders').timeBased().everyMinutes(5).create();
}
