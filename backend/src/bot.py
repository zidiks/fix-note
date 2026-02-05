import logging
import asyncio
from collections import defaultdict
from typing import List, Optional

from aiogram import Bot, Dispatcher, Router, F
from aiogram.types import (
    Message, 
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
    PreCheckoutQuery,
    LabeledPrice,
    PhotoSize
)
from aiogram.filters import Command, CommandStart
from aiogram.enums import ParseMode
from aiogram.methods import CreateInvoiceLink

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

# Buffer for collecting forwarded messages (user_id -> list of messages)
forwarded_messages_buffer: dict[int, list[Message]] = defaultdict(list)
forwarded_messages_tasks: dict[int, asyncio.Task] = {}

# Buffer for collecting media group messages (media_group_id -> list of messages)
media_group_buffer: dict[str, list[Message]] = defaultdict(list)
media_group_tasks: dict[str, asyncio.Task] = {}


async def get_telegram_file_url(file_id: str) -> Optional[str]:
    """Get permanent Telegram file URL from file_id."""
    try:
        file = await bot.get_file(file_id)
        if file.file_path:
            return f"https://api.telegram.org/file/bot{settings.telegram_bot_token}/{file.file_path}"
    except Exception as e:
        logger.error(f"Failed to get file URL: {e}")
    return None


async def get_largest_photo(photos: List[PhotoSize]) -> Optional[PhotoSize]:
    """Get the largest photo from a list of photo sizes."""
    if not photos:
        return None
    # Photos are sorted by size ascending, so last one is largest
    return max(photos, key=lambda p: p.width * p.height)


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
    
    # Check subscription for AI chat feature
    can_use, plan, reason = await notes_service.can_use_feature(user.id, "chat")
    if not can_use:
        if reason == "free_plan":
            await message.answer(
                "🔒 **AI-чат недоступен**\n\n"
                "На бесплатном плане AI-поиск по заметкам не поддерживается.\n\n"
                "Оформите подписку Pro или Ultra, чтобы задавать вопросы по своим заметкам.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=get_notes_inline_keyboard()
            )
            return
        elif reason == "not_available":
            await message.answer(
                "🔒 **AI-чат недоступен**\n\n"
                f"На плане {plan.title()} AI-чат не поддерживается.\n\n"
                "Обновите подписку для доступа к этой функции.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=get_notes_inline_keyboard()
            )
            return
    
    # Send status message (will be edited)
    status_msg = await message.answer("🔍 Ищу в твоих заметках...")
    
    # Search for relevant notes
    results = await rag_service.search_with_threshold(
        query=question,
        user_id=str(user.id),
        limit=5,
        min_similarity=0.2
    )
    
    if not results:
        await status_msg.edit_text(
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
    
    # Track chat usage
    await notes_service.increment_usage(user.id, "chat_messages", 1)
    
    await status_msg.edit_text(f"💡 **Ответ:**\n\n{answer}", parse_mode=ParseMode.MARKDOWN)


@router.message(Command("status"))
async def cmd_status(message: Message):
    """Handle /status command - check services."""
    if not check_user_allowed(message.from_user.id):
        return
    
    status_msg = await message.answer("🔄 Проверяю сервисы...")
    
    whisper_ok = await transcription_service.health_check()
    deepseek_ok = await summarizer_service.health_check()
    openai_ok = await rag_service.health_check()
    
    status_text = f"""📡 **Статус сервисов:**

🎙 Whisper (транскрипция): {"✅" if whisper_ok else "❌"}
🤖 DeepSeek (саммари): {"✅" if deepseek_ok else "❌"}
🔍 OpenAI (embeddings): {"✅" if openai_ok else "❌"}"""
    
    await status_msg.edit_text(status_text, parse_mode=ParseMode.MARKDOWN)


# Inline query handler for sharing notes
@router.inline_query()
async def handle_inline_query(inline_query: InlineQuery):
    """Handle inline queries for sharing notes."""
    query = inline_query.query
    
    # Only handle share_note_ queries
    if not query.startswith("share_note_"):
        return
    
    share_token = query.replace("share_note_", "")
    if not share_token or len(share_token) < 16:
        return
    
    # Get shared note data
    result = await notes_service.get_note_by_share_token(share_token)
    if not result:
        return
    
    note = result["note"]
    
    # Get first line of content as preview
    first_line = note.content.split('\n')[0].strip()
    if len(first_line) > 60:
        first_line = first_line[:60] + "..."
    
    # Prepare title for inline picker
    title = f"📝 {first_line}"
    description = "Нажми, чтобы отправить заметку"
    
    # Message text - only first line preview
    if note.source == "voice":
        message_text = f"🎤 <b>{first_line}</b>..."
    else:
        message_text = f"📝 <b>{first_line}</b>..."
    
    # Create inline result with button to open note
    results = [
        InlineQueryResultArticle(
            id=share_token,
            title=title,
            description=description,
            input_message_content=InputTextMessageContent(
                message_text=message_text,
                parse_mode=ParseMode.HTML
            ),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(
                    text="📖 Открыть заметку",
                    url=f"https://t.me/fixnote_bot?startapp={share_token}"
                )]
            ])
        )
    ]
    
    await inline_query.answer(results, cache_time=60)


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
    
    # Check subscription for voice feature
    can_use, plan, reason = await notes_service.can_use_feature(user.id, "voice")
    if not can_use:
        if reason == "free_plan":
            await message.answer(
                "🔒 **Голосовые заметки недоступны**\n\n"
                "На бесплатном плане голосовые заметки не поддерживаются.\n\n"
                "Оформите подписку Pro или Ultra, чтобы:\n"
                "• Записывать голосовые заметки\n"
                "• Получать AI-саммари\n"
                "• Использовать AI-чат\n\n"
                "Откройте приложение для оформления подписки 👇",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=get_notes_inline_keyboard()
            )
            return
        elif reason == "limit_reached":
            await message.answer(
                "⚠️ **Лимит голосовых заметок исчерпан**\n\n"
                f"Вы достигли лимита голосовых заметок на плане {plan.title()}.\n\n"
                "Обновите подписку до Ultra для увеличения лимита или дождитесь следующего месяца.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=get_notes_inline_keyboard()
            )
            return
    
    # Send initial status message (will be edited)
    status_msg = await message.answer("🎧 Обрабатываю голосовое сообщение...")
    
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
            await status_msg.edit_text("❌ Не удалось транскрибировать аудио. Попробуй ещё раз.")
            return
        
        # Track voice usage (in seconds)
        await notes_service.increment_usage(user.id, "voice_seconds", message.voice.duration or 0)
        
        # Check subscription for summary feature (title + summary via DeepSeek)
        can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
        
        title, summary = None, None
        if can_summarize:
            await status_msg.edit_text("✨ Создаю заголовок и саммари...")
            title, summary = await summarizer_service.summarize_with_title(transcription)
            if title or summary:
                await notes_service.increment_usage(user.id, "summaries", 1)
        
        # Save note
        note = await notes_service.create_note(
            user_id=user.id,
            note_data=NoteCreate(
                content=transcription,
                title=title,
                summary=summary,
                source="voice",
                duration_seconds=message.voice.duration
            )
        )
        
        # Index for RAG
        await rag_service.index_note(str(note.id), transcription)
        
        # Final response - edit the same message
        response = f"""✅ **Заметка сохранена!**

📝 **Текст:**
{transcription[:500]}{"..." if len(transcription) > 500 else ""}

"""
        if summary:
            response += f"""💡 **Саммари:**
{summary}"""
        elif not can_summarize:
            response += "_💡 AI-саммари недоступно на вашем плане_"
        
        await status_msg.edit_text(response, parse_mode=ParseMode.MARKDOWN)
        
    except Exception as e:
        logger.error(f"Voice processing error: {e}")
        try:
            await status_msg.edit_text("❌ Произошла ошибка при обработке. Попробуй позже.")
        except:
            await message.answer("❌ Произошла ошибка при обработке. Попробуй позже.")


async def process_forwarded_messages(user_id: int, chat_id: int):
    """Process buffered forwarded messages after delay."""
    await asyncio.sleep(0.5)  # Wait for more messages to arrive
    
    messages = forwarded_messages_buffer.pop(user_id, [])
    forwarded_messages_tasks.pop(user_id, None)
    
    if not messages:
        return
    
    # Get user
    first_msg = messages[0]
    user = await notes_service.get_or_create_user(
        telegram_id=user_id,
        username=first_msg.from_user.username,
        first_name=first_msg.from_user.first_name
    )
    
    # Combine all message texts and collect images
    combined_texts = []
    image_urls = []
    
    for msg in messages:
        # Handle text
        if msg.text:
            combined_texts.append(msg.text.strip())
        elif msg.caption:
            combined_texts.append(msg.caption.strip())
        
        # Handle photos
        if msg.photo:
            largest = await get_largest_photo(msg.photo)
            if largest:
                url = await get_telegram_file_url(largest.file_id)
                if url:
                    image_urls.append(url)
    
    # Need either text or images
    if not combined_texts and not image_urls:
        return
    
    combined_text = "\n\n".join(combined_texts) if combined_texts else "📷 Изображения без текста"
    source = "photo" if image_urls else "text"

    # Generate title (and summary) via DeepSeek when allowed
    title, summary = None, None
    can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
    if can_summarize and len(combined_text.strip()) >= 10:
        title, summary = await summarizer_service.summarize_with_title(combined_text)
        if title or summary:
            await notes_service.increment_usage(user.id, "summaries", 1)

    # Save as single note
    note = await notes_service.create_note(
        user_id=user.id,
        note_data=NoteCreate(
            content=combined_text,
            title=title,
            summary=summary,
            source=source,
            images=image_urls
        )
    )
    
    # Index for RAG
    await rag_service.index_note(str(note.id), combined_text)
    
    # Send confirmation
    msg_count = len(messages)
    photo_text = f" с {len(image_urls)} фото" if image_urls else ""
    await bot.send_message(
        chat_id,
        f"✅ {msg_count} сообщений{photo_text} сохранено как 1 заметка!"
    )


async def process_media_group(media_group_id: str, user_id: int, chat_id: int):
    """Process media group (multiple photos sent together) after delay."""
    await asyncio.sleep(0.8)  # Wait for all media group messages
    
    messages = media_group_buffer.pop(media_group_id, [])
    media_group_tasks.pop(media_group_id, None)
    
    if not messages:
        return
    
    # Get user
    first_msg = messages[0]
    user = await notes_service.get_or_create_user(
        telegram_id=user_id,
        username=first_msg.from_user.username,
        first_name=first_msg.from_user.first_name
    )
    
    # Collect all images and captions
    image_urls = []
    captions = []
    
    for msg in messages:
        if msg.caption:
            captions.append(msg.caption.strip())
        
        if msg.photo:
            largest = await get_largest_photo(msg.photo)
            if largest:
                url = await get_telegram_file_url(largest.file_id)
                if url:
                    image_urls.append(url)
    
    if not image_urls:
        return
    
    # Combine captions or use default text
    content = "\n\n".join(captions) if captions else f"📷 {len(image_urls)} изображений"

    # Generate title (and summary) via DeepSeek when allowed
    title, summary = None, None
    can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
    if can_summarize and len(content.strip()) >= 10:
        title, summary = await summarizer_service.summarize_with_title(content)
        if title or summary:
            await notes_service.increment_usage(user.id, "summaries", 1)

    # Save note
    note = await notes_service.create_note(
        user_id=user.id,
        note_data=NoteCreate(
            content=content,
            title=title,
            summary=summary,
            source="photo",
            images=image_urls
        )
    )
    
    # Index for RAG
    await rag_service.index_note(str(note.id), content)
    
    await bot.send_message(
        chat_id,
        f"✅ Сохранено {len(image_urls)} фото как заметка!"
    )


@router.message(F.text)
async def handle_text(message: Message):
    """Handle text message - save as note or process as AI query."""
    if not check_user_allowed(message.from_user.id):
        return
    
    # Skip commands
    if message.text and message.text.startswith("/"):
        return
    
    user_id = message.from_user.id
    
    # Check if this is a forwarded message
    if message.forward_date:
        # Add to buffer
        forwarded_messages_buffer[user_id].append(message)
        
        # Cancel existing task if any
        if user_id in forwarded_messages_tasks:
            forwarded_messages_tasks[user_id].cancel()
        
        # Schedule processing after delay
        task = asyncio.create_task(
            process_forwarded_messages(user_id, message.chat.id)
        )
        forwarded_messages_tasks[user_id] = task
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
        # Check subscription for AI chat feature
        can_use, _, _ = await notes_service.can_use_feature(user.id, "chat")
        
        if not can_use:
            # Can't use AI - just save as note
            await save_text_note(message, user, text)
            return
        
        # Treat as AI query - edit single message
        status_msg = await message.answer("🔍 Ищу ответ в заметках...")
        
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
            
            # Track chat usage
            await notes_service.increment_usage(user.id, "chat_messages", 1)
            
            await status_msg.edit_text(f"💡 **Ответ:**\n\n{answer}", parse_mode=ParseMode.MARKDOWN)
        else:
            # No results - save as note instead
            await status_msg.delete()
            await save_text_note(message, user, text)
    else:
        # Save as note
        await save_text_note(message, user, text)


async def save_text_note(message: Message, user, text: str):
    """Save text as a note. Generate title (and summary) via DeepSeek when allowed."""
    title, summary = None, None
    can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
    if can_summarize and len(text.strip()) >= 10:
        title, summary = await summarizer_service.summarize_with_title(text)
        if title or summary:
            await notes_service.increment_usage(user.id, "summaries", 1)

    note = await notes_service.create_note(
        user_id=user.id,
        note_data=NoteCreate(
            content=text,
            title=title,
            summary=summary,
            source="text"
        )
    )

    # Index for RAG
    await rag_service.index_note(str(note.id), text)

    await message.answer("✅ Заметка сохранена!")


@router.message(F.photo)
async def handle_photo(message: Message):
    """Handle photo message - save as note with image."""
    if not check_user_allowed(message.from_user.id):
        return
    
    user_id = message.from_user.id
    
    # Check if this is part of a media group
    if message.media_group_id:
        # Check if forwarded
        if message.forward_date:
            # Treat as forwarded message
            forwarded_messages_buffer[user_id].append(message)
            
            if user_id in forwarded_messages_tasks:
                forwarded_messages_tasks[user_id].cancel()
            
            task = asyncio.create_task(
                process_forwarded_messages(user_id, message.chat.id)
            )
            forwarded_messages_tasks[user_id] = task
        else:
            # Regular media group
            media_group_buffer[message.media_group_id].append(message)
            
            if message.media_group_id in media_group_tasks:
                media_group_tasks[message.media_group_id].cancel()
            
            task = asyncio.create_task(
                process_media_group(message.media_group_id, user_id, message.chat.id)
            )
            media_group_tasks[message.media_group_id] = task
        return
    
    # Check if forwarded single photo
    if message.forward_date:
        forwarded_messages_buffer[user_id].append(message)
        
        if user_id in forwarded_messages_tasks:
            forwarded_messages_tasks[user_id].cancel()
        
        task = asyncio.create_task(
            process_forwarded_messages(user_id, message.chat.id)
        )
        forwarded_messages_tasks[user_id] = task
        return
    
    # Single photo - process immediately
    user = await notes_service.get_or_create_user(
        telegram_id=user_id,
        username=message.from_user.username,
        first_name=message.from_user.first_name
    )
    
    # Get largest photo
    largest = await get_largest_photo(message.photo)
    if not largest:
        await message.answer("❌ Не удалось обработать изображение")
        return
    
    # Get file URL
    url = await get_telegram_file_url(largest.file_id)
    if not url:
        await message.answer("❌ Не удалось получить URL изображения")
        return
    
    # Get caption or use default
    content = message.caption.strip() if message.caption else "📷 Изображение"
    
    # Save note
    note = await notes_service.create_note(
        user_id=user.id,
        note_data=NoteCreate(
            content=content,
            source="photo",
            images=[url]
        )
    )
    
    # Index for RAG
    await rag_service.index_note(str(note.id), content)
    
    await message.answer("✅ Фото сохранено как заметка!")


# Payment handlers for Telegram Stars
@router.pre_checkout_query()
async def process_pre_checkout_query(pre_checkout_query: PreCheckoutQuery):
    """Handle pre-checkout query - validate the payment."""
    # Always approve the payment (basic validation)
    # In production, you might want to validate the payload
    await pre_checkout_query.answer(ok=True)


@router.message(F.successful_payment)
async def process_successful_payment(message: Message):
    """Handle successful payment - activate subscription."""
    payment = message.successful_payment
    
    if not payment:
        return
    
    # Parse payload: user_id:plan:billing_period:unique_id
    try:
        payload_parts = payment.invoice_payload.split(":")
        if len(payload_parts) < 3:
            logger.error(f"Invalid payment payload: {payment.invoice_payload}")
            return
        
        user_uuid = payload_parts[0]
        plan = payload_parts[1]
        billing_period = payload_parts[2]
        
        # Activate subscription
        success = await notes_service.activate_subscription(
            user_id=user_uuid,
            plan=plan,
            billing_period=billing_period
        )
        
        if success:
            # Get plan name for message
            plan_names = {
                "pro": "Pro ⭐️",
                "ultra": "Ultra 💎"
            }
            plan_name = plan_names.get(plan, plan.title())
            
            period_text = "месяц" if billing_period == "monthly" else "год"
            
            await message.answer(
                f"🎉 **Подписка {plan_name} активирована!**\n\n"
                f"Ваша подписка действует на {period_text}.\n"
                f"Спасибо за поддержку! ❤️",
                parse_mode=ParseMode.MARKDOWN
            )
            
            logger.info(f"Subscription activated: user={user_uuid}, plan={plan}, period={billing_period}")
        else:
            await message.answer(
                "⚠️ Платёж получен, но возникла ошибка при активации подписки. "
                "Пожалуйста, свяжитесь с поддержкой."
            )
            logger.error(f"Failed to activate subscription: user={user_uuid}, plan={plan}")
            
    except Exception as e:
        logger.error(f"Payment processing error: {e}")
        await message.answer(
            "⚠️ Произошла ошибка при обработке платежа. "
            "Пожалуйста, свяжитесь с поддержкой."
        )


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

