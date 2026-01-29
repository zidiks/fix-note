# Voice Notes - Telegram Bot + Mini App

Telegram-бот для создания голосовых и текстовых заметок с AI-суммаризацией и умным поиском (RAG). Включает Telegram Mini App для просмотра заметок с нативным iOS-подобным дизайном.

## 🎯 Возможности

- 🎤 **Голосовые заметки**: отправка голосового → транскрипция → AI саммари → сохранение
- 📝 **Текстовые заметки**: отправка текста → сохранение
- 🔍 **RAG (умный поиск)**: задать вопрос → найти релевантные заметки → AI-ответ
- 📱 **Mini App**: просмотр всех заметок с группировкой по дате

## 🛠 Технологии

| Компонент | Технология |
|-----------|------------|
| Backend | Python 3.11+, aiogram 3.x, FastAPI |
| Frontend | React 18+, TypeScript, Vite, Tailwind CSS |
| Database | Supabase (PostgreSQL + pgvector) |
| AI Summarization | DeepSeek API |
| Transcription | Whisper API (self-hosted) |
| Embeddings | OpenAI text-embedding-3-small |
| Deploy | Docker, GitHub Actions |

## 📁 Структура проекта

```
fix-note/
├── backend/
│   ├── src/
│   │   ├── main.py              # Entry point
│   │   ├── config.py            # Environment config
│   │   ├── bot.py               # Telegram bot handlers
│   │   ├── api.py               # FastAPI routes
│   │   ├── services/
│   │   │   ├── transcription.py # Whisper STT
│   │   │   ├── summarizer.py    # DeepSeek AI
│   │   │   ├── rag_service.py   # RAG + embeddings
│   │   │   └── notes_service.py # CRUD operations
│   │   └── db/
│   │       ├── supabase.py      # Supabase client
│   │       └── models.py        # Pydantic models
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── styles/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml           # Для локальной разработки
├── docker-compose.prod.yml      # Для production
├── nginx.conf
├── env.example
└── README.md
```

## 🚀 Быстрый старт

### Предварительные требования

- Docker & Docker Compose
- Telegram Bot Token (от [@BotFather](https://t.me/BotFather))
- Supabase Project
- DeepSeek API Key
- OpenAI API Key

### 1. Клонирование и настройка

```bash
git clone https://github.com/your-username/fix-note.git
cd fix-note

# Копируем env файл
cp env.example .env

# Редактируем .env
nano .env
```

### 2. Локальный запуск

```bash
# Сборка и запуск
docker-compose up -d

# Проверка логов
docker-compose logs -f backend
```

### 3. Production деплой

```bash
# Используем production конфиг с другими портами
docker compose -f docker-compose.prod.yml up -d --build
```

## 🤖 Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Приветствие + главное меню |
| `/help` | Справка |
| `/ask <вопрос>` | RAG-запрос по заметкам |
| `/notes` | Открыть Mini App |
| `/stats` | Статистика заметок |
| `/status` | Статус сервисов |

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notes` | Список заметок |
| GET | `/api/notes/{id}` | Получить заметку |
| POST | `/api/notes` | Создать заметку |
| PUT | `/api/notes/{id}` | Обновить заметку |
| DELETE | `/api/notes/{id}` | Удалить заметку |
| POST | `/api/notes/search` | Семантический поиск |
| GET | `/api/stats` | Статистика |

## 🔧 Переменные окружения

| Переменная | Описание |
|------------|----------|
| `TELEGRAM_BOT_TOKEN` | Токен бота |
| `ALLOWED_USER_IDS` | ID разрешённых пользователей (через запятую) |
| `SUPABASE_URL` | URL Supabase проекта |
| `SUPABASE_ANON_KEY` | Публичный ключ Supabase |
| `SUPABASE_SERVICE_KEY` | Service role ключ (JWT формат) |
| `DEEPSEEK_API_KEY` | Ключ DeepSeek API |
| `OPENAI_API_KEY` | Ключ OpenAI API |
| `WHISPER_API_URL` | URL Whisper сервиса |
| `PUBLIC_URL` | Публичный URL для Mini App |

## 📦 Деплой на сервер

### С существующим Nginx Proxy Manager

1. Скопируйте проект на сервер:
```bash
scp -r . user@server:/opt/voice-notes
```

2. Создайте `.env` файл на сервере

3. Запустите с production конфигом:
```bash
cd /opt/voice-notes
docker compose -f docker-compose.prod.yml up -d --build
```

4. В Nginx Proxy Manager добавьте прокси:
   - Frontend: `your-domain.com` → `172.17.0.1:3010`
   - API Location `/api` → `172.17.0.1:8010`

### GitHub Actions (CI/CD)

1. Добавьте секреты в репозитории:
   - `SERVER_HOST` - IP сервера
   - `SERVER_USER` - SSH пользователь
   - `SERVER_SSH_KEY` - Приватный SSH ключ

2. Push в `main` запустит автодеплой

## 📱 Регистрация Mini App

1. Откройте [@BotFather](https://t.me/BotFather)
2. Выберите бота → Bot Settings → Menu Button
3. Укажите URL: `https://your-domain.com/app`

## 📋 Требования к серверу

| Ресурс | Минимум |
|--------|---------|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 20 GB SSD |
| OS | Ubuntu 22.04 |

## 📄 Лицензия

MIT
