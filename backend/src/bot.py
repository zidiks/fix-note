import logging
import tempfile
import os
from typing import Optional

from aiogram import Bot, Dispatcher, Router, F
from aiogram.types import (
    Message, 
    ReplyKeyboardMarkup, 
    KeyboardButton,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo
)
from aiogram.filters import Command, CommandStart
from aiogram.enums import ParseMode

from .config import settings
from .db.models import NoteCreate
from .services.notes_service import NotesService
from .services.transcription import TranscriptionService
from .services.summarizer import SummarizerService
from .services.rag_service import RAGService

logger = logging.getLogger(__name__)

# Initialize bot and dispatcher
bot = Bot(token=settings.telegram_bot_token)
dp = Dispatcher()
router = Router()

# Services
notes_service = NotesService()
transcription_service = TranscriptionService()
summarizer_service = SummarizerService()
rag_service = RAGService()


def get_main_keyboard() -> ReplyKeyboardMarkup:
    """Get main reply keyboard."""
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🎤 Голосовая заметка"),
                KeyboardButton(text="📝 Текстовая заметка")
            ],
            [
                KeyboardButton(text="🔍 Спросить AI"),
                KeyboardButton(text="📋 Мои заметки")
            ],
            [
                KeyboardButton(text="📊 Статистика"),
                KeyboardButton(text="❓ Помощь")
            ]
        ],
        resize_keyboard=True
    )
    return keyboard


def get_notes_inline_keyboard() -> InlineKeyboardMarkup:
    """Get inline keyboard with Mini App button."""
    if settings.public_url:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="📋 Открыть заметки",
                web_app=WebAppInfo(url=f"{settings.public_url}/app")
            )]
        ])
    else:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[])
    return keyboard


def check_user_allowed(user_id: int) -> bool:
    """Check if user is allowed to use the bot."""
    allowed_ids = settings.allowed_user_ids_list
    if not allowed_ids:
        return True
    return user_id in allowed_ids


# Command handlers
@router.message(CommandStart())
async def cmd_start(message: Message):
    """Handle /start command."""
    if not check_user_allowed(message.from_user.id):
        await message.answer("⛔ Доступ запрещён.")
        return
    
    user = await notes_service.get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        language_code=message.from_user.language_code or "ru"
    )
    
    welcome_text = f"""👋 Привет, {message.from_user.first_name or 'друг'}!

Я бот для голосовых и текстовых заметок с AI-возможностями:

🎤 **Голосовые заметки** — отправь голосовое сообщение, я транскрибирую его и создам краткое саммари

📝 **Текстовые заметки** — просто напиши текст, и я сохраню его как заметку

🔍 **Умный поиск** — используй команду /ask чтобы задать вопрос по своим заметкам

📋 **Mini App** — открой все заметки в удобном интерфейсе

Начни с отправки голосового или текстового сообщения!"""
    
    await message.answer(
        welcome_text, 
        reply_markup=get_main_keyboard(),
        parse_mode=ParseMode.MARKDOWN
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    """Handle /help command."""
    help_text = """📖 **Справка по боту**

**Команды:**
/start — Начать работу
/help — Эта справка
/ask <вопрос> — Задать вопрос по заметкам
/notes — Открыть Mini App с заметками
/stats — Статистика заметок

**Как использовать:**

🎤 **Голосовые заметки**
Отправь голосовое сообщение. Бот автоматически:
1. Транскрибирует аудио в текст
2. Создаст краткое AI-саммари
3. Сохранит заметку с возможностью поиска

📝 **Текстовые заметки**
Просто напиши текст — он сохранится как заметка.

🔍 **RAG-поиск**
Используй /ask чтобы задать вопрос. AI найдёт релевантные заметки и ответит на основе твоих записей.

_Пример: /ask Что мы обсуждали на прошлой встрече?_"""

    await message.answer(help_text, parse_mode=ParseMode.MARKDOWN)


@router.message(Command("notes"))
async def cmd_notes(message: Message):
    """Handle /notes command - open Mini App."""
    if not check_user_allowed(message.from_user.id):
        return
    
    if settings.public_url:
        await message.answer(
            "📋 Открой заметки в Mini App:",
            reply_markup=get_notes_inline_keyboard()
        )
    else:
        # Fallback: show recent notes
        user = await notes_service.get_or_create_user(
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name
        )
        
        notes = await notes_service.get_notes(user.id, limit=10)
        
        if not notes:
            await message.answer("📝 У тебя пока нет заметок. Отправь голосовое или текстовое сообщение!")
            return
        
        text_parts = ["📋 **Последние заметки:**\n"]
        for i, note in enumerate(notes, 1):
            icon = "🎤" if note.source == "voice" else "📝"
            preview = (note.summary or note.content)[:100]
            if len(note.summary or note.content) > 100:
                preview += "..."
            date = note.created_at.strftime("%d.%m %H:%M")
            text_parts.append(f"{i}. {icon} {preview}\n   _{date}_\n")
        
        await message.answer("\n".join(text_parts), parse_mode=ParseMode.MARKDOWN)


@router.message(Command("stats"))
async def cmd_stats(message: Message):
    """Handle /stats command."""
    if not check_user_allowed(message.from_user.id):
        return
    
    user = await notes_service.get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name
    )
    
    stats = await notes_service.get_stats(user.id)
    
    text = f"""📊 **Статистика заметок**

📝 Всего заметок: **{stats.total_notes}**
🎤 Голосовых: **{stats.voice_notes}**
✏️ Текстовых: **{stats.text_notes}**

📅 За эту неделю: **{stats.notes_this_week}**
📆 За этот месяц: **{stats.notes_this_month}**"""
    
    await message.answer(text, parse_mode=ParseMode.MARKDOWN)


@router.message(Command("ask"))
async def cmd_ask(message: Message):
    """Handle /ask command - RAG query."""
    if not check_user_allowed(message.from_user.id):
        return
    
    # Extract question from command
    question = message.text.replace("/ask", "").strip()
    
    if not question:
        await message.answer(
            "❓ Укажи вопрос после команды.\n\n_Пример: /ask Что мы обсуждали на встрече?_",
            parse_mode=ParseMode.MARKDOWN
        )
        return
    
    user = await notes_service.get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name
    )
    
    # Show typing indicator
    await message.answer("🔍 Ищу в твоих заметках...")
    
    # Search for relevant notes
    results = await rag_service.search_with_threshold(
        query=question,
        user_id=str(user.id),
        limit=5,
        min_similarity=0.2
    )
    
    if not results:
        await message.answer(
            "😕 Не нашёл релевантных заметок. Попробуй переформулировать вопрос или добавь больше заметок."
        )
        return
    
    # Convert results to dict for summarizer
    context = [
        {
            "content": r.content,
            "summary": r.summary,
            "similarity": r.similarity
        }
        for r in results
    ]
    
    # Generate AI response
    answer = await summarizer_service.ask(question, context)
    
    await message.answer(f"💡 **Ответ:**\n\n{answer}", parse_mode=ParseMode.MARKDOWN)


@router.message(Command("status"))
async def cmd_status(message: Message):
    """Handle /status command - check services."""
    if not check_user_allowed(message.from_user.id):
        return
    
    await message.answer("🔄 Проверяю сервисы...")
    
    whisper_ok = await transcription_service.health_check()
    deepseek_ok = await summarizer_service.health_check()
    openai_ok = await rag_service.health_check()
    
    status_text = f"""📡 **Статус сервисов:**

🎙 Whisper (транскрипция): {"✅" if whisper_ok else "❌"}
🤖 DeepSeek (саммари): {"✅" if deepseek_ok else "❌"}
🔍 OpenAI (embeddings): {"✅" if openai_ok else "❌"}"""
    
    await message.answer(status_text, parse_mode=ParseMode.MARKDOWN)


# Button handlers
@router.message(F.text == "🎤 Голосовая заметка")
async def btn_voice(message: Message):
    """Handle voice note button."""
    await message.answer("🎤 Отправь голосовое сообщение, и я создам заметку с транскрипцией и саммари.")


@router.message(F.text == "📝 Текстовая заметка")
async def btn_text(message: Message):
    """Handle text note button."""
    await message.answer("📝 Напиши текст заметки в следующем сообщении.")


@router.message(F.text == "🔍 Спросить AI")
async def btn_ask(message: Message):
    """Handle AI question button."""
    await message.answer(
        "🔍 Напиши вопрос, и я поищу ответ в твоих заметках.\n\n_Пример: Что мы обсуждали на прошлой встрече?_",
        parse_mode=ParseMode.MARKDOWN
    )


@router.message(F.text == "📋 Мои заметки")
async def btn_notes(message: Message):
    """Handle notes button."""
    await cmd_notes(message)


@router.message(F.text == "📊 Статистика")
async def btn_stats(message: Message):
    """Handle stats button."""
    await cmd_stats(message)


@router.message(F.text == "❓ Помощь")
async def btn_help(message: Message):
    """Handle help button."""
    await cmd_help(message)


# Content handlers
@router.message(F.voice)
async def handle_voice(message: Message):
    """Handle voice message - transcribe and save as note."""
    if not check_user_allowed(message.from_user.id):
        return
    
    user = await notes_service.get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name
    )
    
    await message.answer("🎧 Обрабатываю голосовое сообщение...")
    
    try:
        # Download voice file
        file = await bot.get_file(message.voice.file_id)
        file_data = await bot.download_file(file.file_path)
        
        # Transcribe
        transcription = await transcription_service.transcribe_bytes(
            audio_data=file_data.read(),
            filename=f"voice_{message.voice.file_id}.ogg",
            language="ru"
        )
        
        if not transcription:
            await message.answer("❌ Не удалось транскрибировать аудио. Попробуй ещё раз.")
            return
        
        await message.answer("✨ Создаю саммари...")
        
        # Generate summary
        summary = await summarizer_service.summarize(transcription)
        
        # Save note
        note = await notes_service.create_note(
            user_id=user.id,
            note_data=NoteCreate(
                content=transcription,
                summary=summary,
                source="voice",
                duration_seconds=message.voice.duration
            )
        )
        
        # Index for RAG
        await rag_service.index_note(str(note.id), transcription)
        
        # Response
        response = f"""✅ **Заметка сохранена!**

📝 **Текст:**
{transcription[:500]}{"..." if len(transcription) > 500 else ""}

"""
        if summary:
            response += f"""💡 **Саммари:**
{summary}"""
        
        await message.answer(response, parse_mode=ParseMode.MARKDOWN)
        
    except Exception as e:
        logger.error(f"Voice processing error: {e}")
        await message.answer("❌ Произошла ошибка при обработке. Попробуй позже.")


@router.message(F.text)
async def handle_text(message: Message):
    """Handle text message - save as note or process as AI query."""
    if not check_user_allowed(message.from_user.id):
        return
    
    # Skip commands
    if message.text.startswith("/"):
        return
    
    user = await notes_service.get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name
    )
    
    text = message.text.strip()
    
    # Check if it's a question (for RAG)
    is_question = (
        text.endswith("?") or 
        text.lower().startswith(("что ", "как ", "где ", "когда ", "почему ", "кто ", "какой ", "сколько "))
    )
    
    if is_question and len(text) < 200:
        # Treat as AI query
        await message.answer("🔍 Ищу ответ в заметках...")
        
        results = await rag_service.search_with_threshold(
            query=text,
            user_id=str(user.id),
            limit=5,
            min_similarity=0.2
        )
        
        if results:
            context = [
                {
                    "content": r.content,
                    "summary": r.summary,
                    "similarity": r.similarity
                }
                for r in results
            ]
            answer = await summarizer_service.ask(text, context)
            await message.answer(f"💡 **Ответ:**\n\n{answer}", parse_mode=ParseMode.MARKDOWN)
        else:
            # No results - save as note instead
            await save_text_note(message, user, text)
    else:
        # Save as note
        await save_text_note(message, user, text)


async def save_text_note(message: Message, user, text: str):
    """Save text as a note."""
    note = await notes_service.create_note(
        user_id=user.id,
        note_data=NoteCreate(
            content=text,
            source="text"
        )
    )
    
    # Index for RAG
    await rag_service.index_note(str(note.id), text)
    
    await message.answer("✅ Заметка сохранена!", reply_markup=get_main_keyboard())


# Register router
dp.include_router(router)


async def start_bot():
    """Start the bot."""
    logger.info("Starting bot...")
    await dp.start_polling(bot)


async def stop_bot():
    """Stop the bot."""
    logger.info("Stopping bot...")
    await bot.session.close()

