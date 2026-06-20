# CLAUDE.md

# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

---

## Проект: Антураж

Сайт-витрина для заказчика, занимающегося продажей картин и фотообоев на заказ. Написан с нуля на ванильном JS + Gulp/Sass. В будущем переедет на WordPress.

### Стек
- **Frontend**: HTML/Sass/JS (Gulp + Webpack/Babel сборка, Swiper.js для слайдеров)
- **Backend**: Google Apps Script (Web App) — принимает POST, пишет в Google Sheets
- **Данные**: Google Sheets `1KTcO1ZiYbZkCjNT946i9fNYEFMMaaEWYSGQpiRZj8PY` (листы: `Заказы`, `Распродажа`, лист с ценами)
- **Бот**: Node.js Telegram bot (`telegram-bot/bot.js`) — для сотрудников
- **Сборка**: `gulp` → `dist/`, исходники в `src/`

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

## Статус задач

### ✅ Готово
- Все страницы фронтенда (вёрстка)
- Отображение товаров из листа `Распродажа` на `sale.html`, фильтр по статусу `=== "В продаже"`
- Калькулятор цены (логика расчёта)
- Форма заказа для обычных товаров → Google Sheets → Telegram-уведомление
- Apps Script (`appsScripts.js`): `doPost`, `handleSaleOrder`, `formatOrderMessage`, `sendTelegramMessage`
- **Заказ из распродажи**: при нажатии "купить" данные покупателя записываются в лист `Распродажа` (поиск колонок по заголовку, не по индексу), товар помечается "Заказано", защита от повторного заказа той же строки на backend, товар скрывается с сайта (локально оптимистично + при следующей загрузке)
- Пустое состояние списка распродажи (`.sale__empty`), если подходящих товаров нет
- Модалка ошибки отправки заказа (`.error-modal__*`) вместо `alert`, с кнопкой "Попробовать снова"
- Полноэкранный просмотр изображения товара в модалке распродажи
- Индикатор времени работы в шапке («сейчас работаем» / «сейчас не работаем»), читает часы/дни из data-атрибутов `data-work-days/-from/-to` на `.header__worktime` — не хардкод, чтобы потом легко переносилось в WordPress
- XSS-хардненинг при выводе данных из Google Sheets (`escapeHtml`, `isValidUrl`)
- Telegram бот (существует, но требует переписывания)

### ❌ Не готово / нужно доделать
- **Telegram бот**: переписать с нуля (текущий код — черновик от Grok, берём только логику, не код). Нужно: список заказов, смена статуса, комментарии, уведомления о новых заказах
- **Производительность**: оптимизация загрузки страниц
- **SEO**: мета-теги, структурированные данные, sitemap
- **WordPress-миграция**: загрузка изображений, защита картинок от кражи, фильтры и сортировка каталога

---

## Правило: всегда давай подсказки

**На протяжении всего проекта Claude обязан предлагать подсказки.** После каждого завершённого блока работы (или при обнаружении проблемы) добавляй секцию:

> **Подсказка:** [что стоит сделать следующим, или что заметил]

Примеры: заметил уязвимость — скажи; есть более простой способ — предложи; видишь, что задача связана с другой незаконченной — укажи. Не жди, пока спросят.

---

## Рабочие договорённости

- **Секреты в коде**: Telegram Bot Token и Spreadsheet ID уже в коде (Apps Script, config.json). Не выносить в env без явной просьбы — это усложнит деплой для заказчика.
- **Apps Script**: актуальный код в `appsScripts.js` (корень проекта). Изменения в нём нужно применять вручную в редакторе Google (Deploy → Manage deployments → New version).
- **CORS / fetch к Apps Script**: Web App ненадёжно обрабатывает CORS preflight для `Content-Type: application/json` — проверено на практике (реальная CORS-ошибка в проде). Поэтому все fetch к Apps Script используют `mode: 'no-cors'` (ответ "opaque", читать `response.json()`/`status` нельзя, в `catch` попадают только сетевые ошибки). Не пытаться переключать на обычный `cors` без явного запроса — это уже пробовали и откатили.
- **Бот**: при работе с ботом смотреть только на логику существующего `bot.js`, код переписывается с нуля.
- **WordPress**: пока не трогаем — сначала доводим до рабочего состояния статическую версию.
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
