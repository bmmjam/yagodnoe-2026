# Ягодное 2026 — Mini App

## 1. Что это

Telegram Mini App для выезда AITH-сообщества 25–26 апреля 2026 в Ягодное. Внутри: карта кэмпа с кликабельными домиками, поиск по имени, «где я живу», расписание с таймером «сейчас», маршрут от домика до точки и easter egg «Почтить сгоревшую баню».

Стек: статический HTML/CSS/JS, без билд-шага. Бэкенда нет, всё в localStorage.

## 2. Локальный запуск

```bash
python3 -m http.server 8080
# открой http://localhost:8080
```

В браузере работает всё, кроме нативных Telegram-фич (haptic, themeParams, expand). Чтобы их проверить — надо задеплоить на HTTPS и открыть внутри Telegram.

## 3. Деплой на GitHub Pages (быстрый путь)

```bash
cd /home/jam/Git/yagodnoe-2026
git init
git add .
git commit -m "init: Ягодное 2026 mini app"

# через gh CLI (проще всего):
gh repo create yagodnoe-2026 --public --source=. --push

# или вручную: создай репо на github.com, потом
# git remote add origin https://github.com/YOUR_USERNAME/yagodnoe-2026.git
# git push -u origin main
```

В настройках репозитория:
1. **Settings → Pages**
2. Source: `Deploy from a branch`
3. Branch: `main`, Folder: `/ (root)`, сохранить
4. Жди 1–2 минуты — адрес появится наверху страницы Pages: `https://YOUR_USERNAME.github.io/yagodnoe-2026/`
5. Открой в браузере, убедись что карта грузится и табы переключаются

## 4. Создание бота и Mini App в Telegram

Открой [@BotFather](https://t.me/BotFather):

**Шаг 1 — бот:**
```
/newbot
→ имя: Ягодное 2026
→ юзернейм: yagodnoe_2026_bot (или свой)
```
Сохрани токен — он нужен для `bot.py`.

**Шаг 2 — привязать Mini App к боту:**
```
/newapp
→ выбери бота
→ Title: Ягодное 2026
→ Short description: Карта, расписание и домики выезда AITH
→ Photo (512×512): опционально
→ Web App URL: https://YOUR_USERNAME.github.io/yagodnoe-2026/
→ Short name: yagodnoe
```

После этого прямая ссылка на Mini App: `t.me/yagodnoe_2026_bot/yagodnoe`.

**Шаг 3 — кнопка меню (чтобы открывалось из меню чата без /start):**
```
/mybots
→ выбери бота
→ Bot Settings → Menu Button → Configure Menu Button
→ текст: 🫐 Ягодное
→ URL: https://YOUR_USERNAME.github.io/yagodnoe-2026/
```

## 5. Запуск бота (опционально)

Если хочешь, чтобы на `/start` бот отвечал сообщением с кнопкой:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# открой .env, впиши TELEGRAM_BOT_TOKEN и MINI_APP_URL

python bot.py
```

Для постоянной работы — подними через `systemd` / `screen` / `tmux` / любой VPS.

## 6. Распространение в чат AITH

Самый простой способ — скинуть прямую Mini App ссылку:
```
t.me/yagodnoe_2026_bot/yagodnoe
```
Открывается одним тапом, без `/start`. Можно оформить постом вроде:

> 🫐 Собрал мини-апп для выезда: карта, расписание, можно найти свой домик и соседей. Плюс почтить сгоревшую баню 🕯
> t.me/yagodnoe_2026_bot/yagodnoe

## 7. Troubleshooting

- **Mini App открывается пустой** → открой URL в Safari/Chrome напрямую. Если и там пусто, проверь что GH Pages собрался (Actions / Deployments во вкладке репозитория).
- **«Refused to run» в Telegram** → URL должен быть HTTPS. GH Pages отдаёт HTTPS автоматически.
- **Карта не кликается** → обнови Telegram клиент (Mini App требует свежий).
- **Данные не грузятся** → DevTools → Network, проверь что `data/*.json` отдаются со статусом 200 и correct MIME.
- **Координаты домиков на карте не совпадают** → правь `data/locations.json`, поля `x`, `y` — проценты от изображения (0–100).
