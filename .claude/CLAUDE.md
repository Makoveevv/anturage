# CLAUDE.md

# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

---

## Проект: Антураж

Сайт-витрина для заказчика, занимающегося продажей картин и фотообоев на заказ. Написан с нуля на ванильном JS + Gulp/Sass. В будущем переедет на WordPress.

### Стек
- **Frontend**: HTML/Sass/JS (Gulp + Webpack/Babel сборка, Swiper.js для слайдеров)
- **Backend + бот**: Google Apps Script — один файл `appsScripts.js`. `doPost` принимает заказы с сайта (нужен Web App-деплой), Telegram-бот для сотрудников работает в том же скрипте через **polling** (`getUpdates`, триггер раз в минуту) — не webhook (webhook у Apps Script вызывает ретрай-штормы)
- **Данные**: Google Sheets `1KTcO1ZiYbZkCjNT946i9fNYEFMMaaEWYSGQpiRZj8PY` (листы: `Заказы`, `Распродажа`, `Доступ`, лист с ценами)
- **Сборка**: `gulp` → `dist/`, исходники в `src/`. Запуск разработки — `gulp` (watch + browser-sync), продакшн-сборка — `gulp build`

### Страницы
`index`, `gallery`, `paintings`, `wallpapers`, `sale`, `pictures`, `price`, `payment`, `blog`

### Ключевые сущности
- **Калькулятор цены** (`Price Calculator Widget` на index.html) — считает стоимость по параметрам (размер, материал и т.д.) на основе данных из Google Sheets
- **Форма заказа** (`makeOrder()` в script.js) — отправляет данные через Apps Script в лист `Заказы`, триггерит уведомление в Telegram
- **Страница распродажи** (`sale.html`) — отображает готовые товары из листа `Распродажа`
- **Telegram бот** — просмотр заказов, смена статуса, комментарии, уведомления

## !!ВАЖНО
Если я прошу что-то добавлять во фронтенд, то всегда старайся следовать стилистике сайта и всегда её учитывай

---

## Архитектурное решение: галерея и переезд на WordPress

Крупная галерея (большая папочная база картинок заказчика, где **имя папки = категория**) **НЕ строится в статике** — это работа WordPress. Причина: WP из коробки даёт медиабиблиотеку, нарезку размеров, `srcset`, WebP (через плагин) и фильтр по таксономии. Делать эту «дорогую инфраструктуру» руками в статике за пару месяцев до миграции — выброшенный труд.

- **Статика сейчас** — это маркетинговые страницы + небольшая кураторская витрина примеров. Поголовной галереи на сотни фото тут не делаем.
- **План миграции базы**: папки заливаются на сервер → пакетный импорт через WP-CLI (`wp media import`) → имя папки становится термином таксономии. Контент лучше как кастомный тип записи «Работа/Картина» (фото + цена + материал), а не голая медиабиблиотека — стыкуется с калькулятором/заказом.
- В статике делаем только **дешёвые и неразрушающие** оптимизации картинок (сжатие в сборке, `loading="lazy"`) — см. ниже.

---

## Статус задач

### ✅ Готово
- Все страницы фронтенда (вёрстка)
- Отображение товаров из листа `Распродажа` на `sale.html`, фильтр по статусу `=== "В продаже"`
- Калькулятор цены (логика расчёта)
- Форма заказа для обычных товаров → Google Sheets → Telegram-уведомление
- Apps Script (`appsScripts.js`), приём заказов с сайта: `doPost` → `handleSiteOrder` / `handleSaleOrder`, уведомления `notifyNewOrder`, резервная проверка `checkNewOrders`
- **Заказ из распродажи**: при нажатии "купить" данные покупателя записываются в лист `Распродажа` (поиск колонок по заголовку, не по индексу), товар помечается "Заказано", защита от повторного заказа той же строки на backend, товар скрывается с сайта (локально оптимистично + при следующей загрузке)
- Пустое состояние списка распродажи (`.sale__empty`), если подходящих товаров нет
- Модалка ошибки отправки заказа (`.error-modal__*`) вместо `alert`, с кнопкой "Попробовать снова"
- Полноэкранный просмотр изображения товара в модалке распродажи
- Индикатор времени работы в шапке («сейчас работаем» / «сейчас не работаем»), читает часы/дни из data-атрибутов `data-work-days/-from/-to` на `.header__worktime` — не хардкод, чтобы потом легко переносилось в WordPress
- XSS-хардненинг при выводе данных из Google Sheets (`escapeHtml`, `isValidUrl`)
- **Telegram-бот (в `appsScripts.js`, polling)**: переписан с нуля. Два раздела (`Заказы` / `Распродажа`), список активных с пагинацией и история, карточка заказа, смена статуса с подтверждением, примечания, статистика, уведомления о новых заказах. Поиск по ФИО / телефону / **номеру строки** среди активных; в кнопке — условный номер заказа + номер строки в таблице. Доступ по chat_id из листа `Доступ` (+ fallback-список). Колонки ищутся по именам заголовков, не по индексам
- **Оптимизация производительности (статика)**:
  - JS-бандл: `gulpfile.js` собирал `js()` в dev-режиме (был ~895 КБ). Исправлено — `js()` = `mode: production` без source-map (~203 КБ), `jsWatch()` = `development` с быстрым source-map
  - Картинки: `gulp-imagemin` подключён в задачу `img()` (mozjpeg q80 / optipng / gifsicle / svgo с сохранением `viewBox`). Экономия ~52% (10.3 → 4.9 МБ). Оригиналы в `src` не трогаются — сжатие только в `dist`
  - `loading="lazy"` на всех растровых `<img>` (HTML + динамические JS-шаблоны распродажи и багетов); первый экран без растровых `<img>` — LCP не страдает
  - Шрифты: убран `@import` из `src/assets/scss/components/_font.scss`, шрифты грузятся через `<link rel="preconnect">` + один `<link rel="stylesheet">` в `<head>` всех страниц
  - Удалён мёртвый код: сторонний `gsi/client` (нигде не использовался) и сломанный IE-полифилл защиты от ПКМ
  - Надёжность Sheets: `getSheetsData` / `fetchPriceData` / `fetchFromGoogle` обёрнуты в `try/catch` с fallback на кэш (даже просроченный) — при сбое Google показываем старые данные, а не пустоту
  - Прочее в `script.js`: `debounce` на resize-обработчики, устранена утечка слушателей `.layer`, `innerHTML +=` в циклах заменён на одно присваивание

### ❌ Не готово / нужно доделать
- **SEO**: мета-теги (`description`/`keywords` пустые), структурированные данные, sitemap
- **WordPress-миграция**: импорт папочной базы → категории, защита картинок от кражи, фильтры и сортировка каталога, WebP/`srcset` (всё это — средствами WP, см. раздел выше)

---

## Правило: всегда давай подсказки

**На протяжении всего проекта Claude обязан предлагать подсказки.** После каждого завершённого блока работы (или при обнаружении проблемы) добавляй секцию:

> **Подсказка:** [что стоит сделать следующим, или что заметил]

Примеры: заметил уязвимость — скажи; есть более простой способ — предложи; видишь, что задача связана с другой незаконченной — укажи. Не жди, пока спросят.

---

## Рабочие договорённости

- **Секреты в коде**: Telegram Bot Token и Spreadsheet ID захардкожены в `appsScripts.js`, URL Apps Script — в `script.js`, Google API-ключ для чтения Sheets — в `script.js`. Не выносить в env без явной просьбы — это усложнит деплой для заказчика. (Ключ Sheets стоит ограничить по HTTP-referrer в Google Cloud Console — это вне кода.)
- **Apps Script**: актуальный код в `appsScripts.js` (корень проекта). Изменения в нём нужно применять вручную в редакторе Google (Deploy → Manage deployments → New version). Бот — отдельный механизм: триггер `pollUpdates` (раз в минуту); первичная настройка — функция `setupBot`, управление — `startPolling` / `stopPolling`.
- **CORS / fetch к Apps Script**: Web App ненадёжно обрабатывает CORS preflight для `Content-Type: application/json` — проверено на практике (реальная CORS-ошибка в проде). Поэтому все fetch к Apps Script используют `mode: 'no-cors'` (ответ "opaque", читать `response.json()`/`status` нельзя, в `catch` попадают только сетевые ошибки). Не пытаться переключать на обычный `cors` без явного запроса — это уже пробовали и откатили.
- **Бот**: живёт целиком в `appsScripts.js` (Node-версия `telegram-bot/bot.js` удалена). Поллинг, а не webhook — на `cors`/webhook не переключать без явной просьбы (уже проверено, откатывали).
- **Сборка JS (webpack в gulp)**: `js()` — продакшн (`mode: production`, без source-map), `jsWatch()` — разработка (`mode: development`). Не менять режимы местами — именно из-за этого бандл раздувался до ~895 КБ.
- **`gulp-imagemin` запинен на 7.x (CommonJS)**: версия 9 — чистый ESM и **без встроенных кодеков**, в CommonJS-gulpfile через `require` не работает. Не апгрейдить без явной просьбы.
- **Шрифты**: подключаются `<link>` + `preconnect` в `<head>`, а не `@import` в CSS. Не возвращать `@import` в `_font.scss` — это тормозит первый рендер (последовательная загрузка).
- **WordPress**: пока не трогаем — сначала доводим до рабочего состояния статическую версию. Крупную галерею делаем на WP, не в статике (см. раздел «Архитектурное решение»).
- **Язык**: общение с пользователем — на русском. Комментарии в коде — на русском.

---

## Karpathy Coding Rules

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
