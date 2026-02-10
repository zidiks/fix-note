import logging
import asyncio
import html
import re
from collections import defaultdict
from typing import List, Optional
from datetime import datetime

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
    PhotoSize,
    MessageEntity
)
from aiogram.enums import MessageEntityType
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


def format_ai_answer_html(answer: str) -> str:
    """Render model output to Telegram-safe HTML with light formatting."""
    if not answer:
        return "рџ’Ў <b>РћС‚РІРµС‚:</b>\n\nРќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РѕС‚РІРµС‚."

    escaped = html.escape(answer.strip())
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)

    lines: List[str] = []
    for line in escaped.splitlines():
        line = re.sub(r"^\s*#{1,6}\s+(.*)$", r"<b>\1</b>", line)
        line = re.sub(r"^\s*[\-\*]\s+", "вЂў ", line)
        lines.append(line)

    body = "\n".join(lines).strip()
    # Keep safe margin under Telegram 4096 char limit for edited messages.
    if len(body) > 3600:
        body = body[:3597] + "..."

    return f"рџ’Ў <b>РћС‚РІРµС‚:</b>\n\n{body}"


async def get_telegram_file_url(file_id: str) -> Optional[str]:
    """Get permanent Telegram file URL from file_id."""
    try:
        file = await bot.get_file(file_id)
        if file.file_path:
            return f"https://api.telegram.org/file/bot{settings.telegram_bot_token}/{file.file_path}"
    except Exception as e:
        logger.error(f"Failed to get file URL: {e}")
    return None


def extract_urls_from_message(message: Message) -> List[str]:
    """Extract URLs from message text or caption using entities."""
    urls = []
    text = message.text or message.caption
    entities = message.entities or message.caption_entities
    
    if not entities:
        return urls
    
    for entity in entities:
        if entity.type == MessageEntityType.URL:
            if text:
                url = text[entity.offset:entity.offset + entity.length]
                urls.append(url)
        elif entity.type == MessageEntityType.TEXT_LINK:
            if entity.url:
                urls.append(entity.url)
    
    return urls


def get_note_open_keyboard(note_id: str) -> Optional[InlineKeyboardMarkup]:
    """Get inline keyboard with button to open note in Mini App."""
    if not settings.public_url:
        return None
    
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="рџ“– РћС‚РєСЂС‹С‚СЊ Р·Р°РјРµС‚РєСѓ",
            web_app=WebAppInfo(url=f"{settings.public_url}/app?note={note_id}")
        )]
    ])


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
                text="рџ“‹ РћС‚РєСЂС‹С‚СЊ Р·Р°РјРµС‚РєРё",
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
        await message.answer("в›” Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰С‘РЅ.")
        return
    
    user = await notes_service.get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        language_code=message.from_user.language_code or "ru"
    )
    
    welcome_text = f"""рџ‘‹ РџСЂРёРІРµС‚, {message.from_user.first_name or 'РґСЂСѓРі'}!

РЇ Р±РѕС‚ РґР»СЏ РіРѕР»РѕСЃРѕРІС‹С… Рё С‚РµРєСЃС‚РѕРІС‹С… Р·Р°РјРµС‚РѕРє СЃ AI-РІРѕР·РјРѕР¶РЅРѕСЃС‚СЏРјРё:

рџЋ¤ **Р“РѕР»РѕСЃРѕРІС‹Рµ Р·Р°РјРµС‚РєРё** вЂ” РѕС‚РїСЂР°РІСЊ РіРѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ, СЏ С‚СЂР°РЅСЃРєСЂРёР±РёСЂСѓСЋ РµРіРѕ Рё СЃРѕР·РґР°Рј РєСЂР°С‚РєРѕРµ СЃР°РјРјР°СЂРё

рџ“ќ **РўРµРєСЃС‚РѕРІС‹Рµ Р·Р°РјРµС‚РєРё** вЂ” РїСЂРѕСЃС‚Рѕ РЅР°РїРёС€Рё С‚РµРєСЃС‚, Рё СЏ СЃРѕС…СЂР°РЅСЋ РµРіРѕ РєР°Рє Р·Р°РјРµС‚РєСѓ

рџ”Ќ **РЈРјРЅС‹Р№ РїРѕРёСЃРє** вЂ” РёСЃРїРѕР»СЊР·СѓР№ РєРѕРјР°РЅРґСѓ /ask С‡С‚РѕР±С‹ Р·Р°РґР°С‚СЊ РІРѕРїСЂРѕСЃ РїРѕ СЃРІРѕРёРј Р·Р°РјРµС‚РєР°Рј

рџ“‹ **Mini App** вЂ” РѕС‚РєСЂРѕР№ РІСЃРµ Р·Р°РјРµС‚РєРё РІ СѓРґРѕР±РЅРѕРј РёРЅС‚РµСЂС„РµР№СЃРµ

РќР°С‡РЅРё СЃ РѕС‚РїСЂР°РІРєРё РіРѕР»РѕСЃРѕРІРѕРіРѕ РёР»Рё С‚РµРєСЃС‚РѕРІРѕРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ!"""
    
    await message.answer(
        welcome_text, 
        parse_mode=ParseMode.MARKDOWN
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    """Handle /help command."""
    help_text = """рџ“– **РЎРїСЂР°РІРєР° РїРѕ Р±РѕС‚Сѓ**

**РљРѕРјР°РЅРґС‹:**
/start вЂ” РќР°С‡Р°С‚СЊ СЂР°Р±РѕС‚Сѓ
/help вЂ” Р­С‚Р° СЃРїСЂР°РІРєР°
/ask <РІРѕРїСЂРѕСЃ> вЂ” Р—Р°РґР°С‚СЊ РІРѕРїСЂРѕСЃ РїРѕ Р·Р°РјРµС‚РєР°Рј
/notes вЂ” РћС‚РєСЂС‹С‚СЊ Mini App СЃ Р·Р°РјРµС‚РєР°РјРё
/stats вЂ” РЎС‚Р°С‚РёСЃС‚РёРєР° Р·Р°РјРµС‚РѕРє

**РљР°Рє РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ:**

рџЋ¤ **Р“РѕР»РѕСЃРѕРІС‹Рµ Р·Р°РјРµС‚РєРё**
РћС‚РїСЂР°РІСЊ РіРѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ. Р‘РѕС‚ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё:
1. РўСЂР°РЅСЃРєСЂРёР±РёСЂСѓРµС‚ Р°СѓРґРёРѕ РІ С‚РµРєСЃС‚
2. РЎРѕР·РґР°СЃС‚ РєСЂР°С‚РєРѕРµ AI-СЃР°РјРјР°СЂРё
3. РЎРѕС…СЂР°РЅРёС‚ Р·Р°РјРµС‚РєСѓ СЃ РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊСЋ РїРѕРёСЃРєР°

рџ“ќ **РўРµРєСЃС‚РѕРІС‹Рµ Р·Р°РјРµС‚РєРё**
РџСЂРѕСЃС‚Рѕ РЅР°РїРёС€Рё С‚РµРєСЃС‚ вЂ” РѕРЅ СЃРѕС…СЂР°РЅРёС‚СЃСЏ РєР°Рє Р·Р°РјРµС‚РєР°.

рџ”Ќ **RAG-РїРѕРёСЃРє**
РСЃРїРѕР»СЊР·СѓР№ /ask С‡С‚РѕР±С‹ Р·Р°РґР°С‚СЊ РІРѕРїСЂРѕСЃ. AI РЅР°Р№РґС‘С‚ СЂРµР»РµРІР°РЅС‚РЅС‹Рµ Р·Р°РјРµС‚РєРё Рё РѕС‚РІРµС‚РёС‚ РЅР° РѕСЃРЅРѕРІРµ С‚РІРѕРёС… Р·Р°РїРёСЃРµР№.

_РџСЂРёРјРµСЂ: /ask Р§С‚Рѕ РјС‹ РѕР±СЃСѓР¶РґР°Р»Рё РЅР° РїСЂРѕС€Р»РѕР№ РІСЃС‚СЂРµС‡Рµ?_"""

    await message.answer(help_text, parse_mode=ParseMode.MARKDOWN)


@router.message(Command("notes"))
async def cmd_notes(message: Message):
    """Handle /notes command - open Mini App."""
    if not check_user_allowed(message.from_user.id):
        return
    
    if settings.public_url:
        await message.answer(
            "рџ“‹ РћС‚РєСЂРѕР№ Р·Р°РјРµС‚РєРё РІ Mini App:",
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
            await message.answer("рџ“ќ РЈ С‚РµР±СЏ РїРѕРєР° РЅРµС‚ Р·Р°РјРµС‚РѕРє. РћС‚РїСЂР°РІСЊ РіРѕР»РѕСЃРѕРІРѕРµ РёР»Рё С‚РµРєСЃС‚РѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ!")
            return
        
        text_parts = ["рџ“‹ **РџРѕСЃР»РµРґРЅРёРµ Р·Р°РјРµС‚РєРё:**\n"]
        for i, note in enumerate(notes, 1):
            icon = "рџЋ¤" if note.source == "voice" else "рџ“ќ"
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
    
    # Show immediate state so user gets instant feedback.
    status_msg = await message.answer("РџСЂРёРЅСЏР» РІРѕРїСЂРѕСЃ, РіРѕС‚РѕРІР»СЋ РїРѕРёСЃРє...")

    user = await notes_service.get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name
    )
    
    stats = await notes_service.get_stats(user.id)
    
    text = f"""рџ“Љ **РЎС‚Р°С‚РёСЃС‚РёРєР° Р·Р°РјРµС‚РѕРє**

рџ“ќ Р’СЃРµРіРѕ Р·Р°РјРµС‚РѕРє: **{stats.total_notes}**
рџЋ¤ Р“РѕР»РѕСЃРѕРІС‹С…: **{stats.voice_notes}**
вњЏпёЏ РўРµРєСЃС‚РѕРІС‹С…: **{stats.text_notes}**

рџ“… Р—Р° СЌС‚Сѓ РЅРµРґРµР»СЋ: **{stats.notes_this_week}**
рџ“† Р—Р° СЌС‚РѕС‚ РјРµСЃСЏС†: **{stats.notes_this_month}**"""
    
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
            "вќ“ РЈРєР°Р¶Рё РІРѕРїСЂРѕСЃ РїРѕСЃР»Рµ РєРѕРјР°РЅРґС‹.\n\n_РџСЂРёРјРµСЂ: /ask Р§С‚Рѕ РјС‹ РѕР±СЃСѓР¶РґР°Р»Рё РЅР° РІСЃС‚СЂРµС‡Рµ?_",
            parse_mode=ParseMode.MARKDOWN
        )
        return
 
    # Immediate state to avoid silent waiting after /ask.
    status_msg = await message.answer("⏳ Принял вопрос, готовлю поиск...")

    user = await notes_service.get_or_create_user(
        telegram_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name
    )
    
    # Check subscription for AI chat feature
    can_use, plan, reason = await notes_service.can_use_feature(user.id, "chat")
    if not can_use:
        try:
            await status_msg.delete()
        except Exception:
            pass

        if reason == "free_plan":
            await message.answer(
                "рџ”’ **AI-С‡Р°С‚ РЅРµРґРѕСЃС‚СѓРїРµРЅ**\n\n"
                "РќР° Р±РµСЃРїР»Р°С‚РЅРѕРј РїР»Р°РЅРµ AI-РїРѕРёСЃРє РїРѕ Р·Р°РјРµС‚РєР°Рј РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ.\n\n"
                "РћС„РѕСЂРјРёС‚Рµ РїРѕРґРїРёСЃРєСѓ Pro РёР»Рё Ultra, С‡С‚РѕР±С‹ Р·Р°РґР°РІР°С‚СЊ РІРѕРїСЂРѕСЃС‹ РїРѕ СЃРІРѕРёРј Р·Р°РјРµС‚РєР°Рј.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=get_notes_inline_keyboard()
            )
            return
        elif reason == "not_available":
            await message.answer(
                "рџ”’ **AI-С‡Р°С‚ РЅРµРґРѕСЃС‚СѓРїРµРЅ**\n\n"
                f"РќР° РїР»Р°РЅРµ {plan.title()} AI-С‡Р°С‚ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ.\n\n"
                "РћР±РЅРѕРІРёС‚Рµ РїРѕРґРїРёСЃРєСѓ РґР»СЏ РґРѕСЃС‚СѓРїР° Рє СЌС‚РѕР№ С„СѓРЅРєС†РёРё.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=get_notes_inline_keyboard()
            )
            return
 
    await status_msg.edit_text("🔍 Ищу в твоих заметках...")
    
    # Search for relevant notes
    try:
        results = await asyncio.wait_for(
            rag_service.search_with_threshold(
                query=question,
                user_id=str(user.id),
                limit=5,
                min_similarity=0.2
            ),
            timeout=25.0,
        )
    except asyncio.TimeoutError:
        await status_msg.edit_text("РЎР»РёС€РєРѕРј РґРѕР»РіРёР№ РїРѕРёСЃРє РїРѕ Р·Р°РјРµС‚РєР°Рј. РџРѕРїСЂРѕР±СѓР№ РїРѕРІС‚РѕСЂРёС‚СЊ Р·Р°РїСЂРѕСЃ.")
        return
    except Exception as e:
        logger.error(f"RAG search failed: {e}")
        await status_msg.edit_text("РћС€РёР±РєР° РїРѕРёСЃРєР° РїРѕ Р·Р°РјРµС‚РєР°Рј. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
        return
    
    if not results:
        await status_msg.edit_text(
            "рџ• РќРµ РЅР°С€С‘Р» СЂРµР»РµРІР°РЅС‚РЅС‹С… Р·Р°РјРµС‚РѕРє. РџРѕРїСЂРѕР±СѓР№ РїРµСЂРµС„РѕСЂРјСѓР»РёСЂРѕРІР°С‚СЊ РІРѕРїСЂРѕСЃ РёР»Рё РґРѕР±Р°РІСЊ Р±РѕР»СЊС€Рµ Р·Р°РјРµС‚РѕРє."
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
    await status_msg.edit_text("Р¤РѕСЂРјРёСЂСѓСЋ РѕС‚РІРµС‚...")
    try:
        answer = await asyncio.wait_for(
            summarizer_service.ask(question, context),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        await status_msg.edit_text("Р“РµРЅРµСЂР°С†РёСЏ РѕС‚РІРµС‚Р° Р·Р°РЅСЏР»Р° СЃР»РёС€РєРѕРј РјРЅРѕРіРѕ РІСЂРµРјРµРЅРё. РџРѕРїСЂРѕР±СѓР№ РµС‰Рµ СЂР°Р·.")
        return
    except Exception as e:
        logger.error(f"RAG answer generation failed: {e}")
        await status_msg.edit_text("РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё РѕС‚РІРµС‚Р°. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
        return
    
    # Track chat usage
    await notes_service.increment_usage(user.id, "chat_messages", 1)
    
    await status_msg.edit_text(format_ai_answer_html(answer), parse_mode=ParseMode.HTML)


@router.message(Command("status"))
async def cmd_status(message: Message):
    """Handle /status command - check services."""
    if not check_user_allowed(message.from_user.id):
        return
    
    status_msg = await message.answer("рџ”„ РџСЂРѕРІРµСЂСЏСЋ СЃРµСЂРІРёСЃС‹...")
    
    whisper_ok = await transcription_service.health_check()
    deepseek_ok = await summarizer_service.health_check()
    embeddings_ok, qdrant_ok = await rag_service.health_details()
    
    status_text = f"""рџ“Ў **РЎС‚Р°С‚СѓСЃ СЃРµСЂРІРёСЃРѕРІ:**

рџЋ™ Whisper (С‚СЂР°РЅСЃРєСЂРёРїС†РёСЏ): {"вњ…" if whisper_ok else "вќЊ"}
рџ¤– DeepSeek (СЃР°РјРјР°СЂРё): {"вњ…" if deepseek_ok else "вќЊ"}
рџ”Ќ TEI (embeddings): {"вњ…" if embeddings_ok else "вќЊ"}
рџ—„ Qdrant (vector DB): {"вњ…" if qdrant_ok else "вќЊ"}"""
    
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
    title = f"рџ“ќ {first_line}"
    description = "РќР°Р¶РјРё, С‡С‚РѕР±С‹ РѕС‚РїСЂР°РІРёС‚СЊ Р·Р°РјРµС‚РєСѓ"
    
    # Message text - only first line preview
    if note.source == "voice":
        message_text = f"рџЋ¤ <b>{first_line}</b>..."
    else:
        message_text = f"рџ“ќ <b>{first_line}</b>..."
    
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
                    text="рџ“– РћС‚РєСЂС‹С‚СЊ Р·Р°РјРµС‚РєСѓ",
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
                "рџ”’ **Р“РѕР»РѕСЃРѕРІС‹Рµ Р·Р°РјРµС‚РєРё РЅРµРґРѕСЃС‚СѓРїРЅС‹**\n\n"
                "РќР° Р±РµСЃРїР»Р°С‚РЅРѕРј РїР»Р°РЅРµ РіРѕР»РѕСЃРѕРІС‹Рµ Р·Р°РјРµС‚РєРё РЅРµ РїРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ.\n\n"
                "РћС„РѕСЂРјРёС‚Рµ РїРѕРґРїРёСЃРєСѓ Pro РёР»Рё Ultra, С‡С‚РѕР±С‹:\n"
                "вЂў Р—Р°РїРёСЃС‹РІР°С‚СЊ РіРѕР»РѕСЃРѕРІС‹Рµ Р·Р°РјРµС‚РєРё\n"
                "вЂў РџРѕР»СѓС‡Р°С‚СЊ AI-СЃР°РјРјР°СЂРё\n"
                "вЂў РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ AI-С‡Р°С‚\n\n"
                "РћС‚РєСЂРѕР№С‚Рµ РїСЂРёР»РѕР¶РµРЅРёРµ РґР»СЏ РѕС„РѕСЂРјР»РµРЅРёСЏ РїРѕРґРїРёСЃРєРё рџ‘‡",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=get_notes_inline_keyboard()
            )
            return
        elif reason == "limit_reached":
            await message.answer(
                "вљ пёЏ **Р›РёРјРёС‚ РіРѕР»РѕСЃРѕРІС‹С… Р·Р°РјРµС‚РѕРє РёСЃС‡РµСЂРїР°РЅ**\n\n"
                f"Р’С‹ РґРѕСЃС‚РёРіР»Рё Р»РёРјРёС‚Р° РіРѕР»РѕСЃРѕРІС‹С… Р·Р°РјРµС‚РѕРє РЅР° РїР»Р°РЅРµ {plan.title()}.\n\n"
                "РћР±РЅРѕРІРёС‚Рµ РїРѕРґРїРёСЃРєСѓ РґРѕ Ultra РґР»СЏ СѓРІРµР»РёС‡РµРЅРёСЏ Р»РёРјРёС‚Р° РёР»Рё РґРѕР¶РґРёС‚РµСЃСЊ СЃР»РµРґСѓСЋС‰РµРіРѕ РјРµСЃСЏС†Р°.",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=get_notes_inline_keyboard()
            )
            return
    
    # Send initial status message (will be edited)
    status_msg = await message.answer("рџЋ§ РћР±СЂР°Р±Р°С‚С‹РІР°СЋ РіРѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ...")
    
    try:
        # Download voice file
        file = await bot.get_file(message.voice.file_id)
        file_data = await bot.download_file(file.file_path)
        
        # Get voice file URL for playback
        voice_url = await get_telegram_file_url(message.voice.file_id)
        
        # Transcribe
        transcription = await transcription_service.transcribe_bytes(
            audio_data=file_data.read(),
            filename=f"voice_{message.voice.file_id}.ogg",
            language="ru"
        )
        
        if not transcription:
            await status_msg.edit_text("вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ С‚СЂР°РЅСЃРєСЂРёР±РёСЂРѕРІР°С‚СЊ Р°СѓРґРёРѕ. РџРѕРїСЂРѕР±СѓР№ РµС‰С‘ СЂР°Р·.")
            return
        
        # Track voice usage (in seconds)
        await notes_service.increment_usage(user.id, "voice_seconds", message.voice.duration or 0)
        
        # Check subscription for summary feature (title + summary via DeepSeek)
        can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
        
        title, summary = None, None
        if can_summarize:
            await status_msg.edit_text("вњЁ РЎРѕР·РґР°СЋ Р·Р°РіРѕР»РѕРІРѕРє Рё СЃР°РјРјР°СЂРё...")
            title, summary = await summarizer_service.summarize_with_title(transcription, user.language_code)
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
                duration_seconds=message.voice.duration,
                voice_url=voice_url
            ),
            user_language=user.language_code
        )
        
        # Index for RAG
        await rag_service.index_note(str(note.id), str(user.id), transcription)
        
        # Final response - edit the same message
        response = "вњ… **Р—Р°РјРµС‚РєР° СЃРѕС…СЂР°РЅРµРЅР°!**"
        if title:
            response += f"\n\nрџ“Њ **{title}**"
        if summary:
            response += f"\n\nрџ’Ў **РЎР°РјРјР°СЂРё:**\n{summary[:200]}{'...' if len(summary) > 200 else ''}"
        elif not can_summarize:
            response += "\n\n_рџ’Ў AI-СЃР°РјРјР°СЂРё РЅРµРґРѕСЃС‚СѓРїРЅРѕ РЅР° РІР°С€РµРј РїР»Р°РЅРµ_"
        
        keyboard = get_note_open_keyboard(str(note.id))
        await status_msg.edit_text(response, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)
        
    except Exception as e:
        logger.error(f"Voice processing error: {e}")
        try:
            await status_msg.edit_text("вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё РѕР±СЂР°Р±РѕС‚РєРµ. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
        except:
            await message.answer("вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё РѕР±СЂР°Р±РѕС‚РєРµ. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")


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
    
    combined_text = "\n\n".join(combined_texts) if combined_texts else "рџ“· РР·РѕР±СЂР°Р¶РµРЅРёСЏ Р±РµР· С‚РµРєСЃС‚Р°"
    source = "photo" if image_urls else "text"

    # Send initial status message
    status_msg = await bot.send_message(chat_id, "рџ“ќ РЎРѕС…СЂР°РЅСЏСЋ РїРµСЂРµСЃР»Р°РЅРЅС‹Рµ СЃРѕРѕР±С‰РµРЅРёСЏ...")
    
    try:
        # Extract URLs from all messages and add to content
        all_urls = []
        for msg in messages:
            all_urls.extend(extract_urls_from_message(msg))
        if all_urls:
            combined_text += "\n\n" + "\n".join(all_urls)
        
        # Generate title (and summary) via DeepSeek when allowed
        title, summary = None, None
        can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
        if can_summarize and len(combined_text.strip()) >= 10:
            await status_msg.edit_text("вњЁ РЎРѕР·РґР°СЋ Р·Р°РіРѕР»РѕРІРѕРє Рё СЃР°РјРјР°СЂРё...")
            title, summary = await summarizer_service.summarize_with_title(combined_text, user.language_code)
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
            ),
            user_language=user.language_code
        )
        
        # Index for RAG
        await rag_service.index_note(str(note.id), str(user.id), combined_text)
        
        # Final response with button
        msg_count = len(messages)
        photo_text = f" СЃ {len(image_urls)} С„РѕС‚Рѕ" if image_urls else ""
        response = f"вњ… **{msg_count} СЃРѕРѕР±С‰РµРЅРёР№{photo_text} СЃРѕС…СЂР°РЅРµРЅРѕ РєР°Рє 1 Р·Р°РјРµС‚РєР°!**"
        if title:
            response += f"\n\nрџ“Њ **{title}**"
        if summary:
            response += f"\n\nрџ’Ў **РЎР°РјРјР°СЂРё:**\n{summary[:200]}{'...' if len(summary) > 200 else ''}"
        elif not can_summarize:
            response += "\n\n_рџ’Ў AI-СЃР°РјРјР°СЂРё РЅРµРґРѕСЃС‚СѓРїРЅРѕ РЅР° РІР°С€РµРј РїР»Р°РЅРµ_"
        
        keyboard = get_note_open_keyboard(str(note.id))
        await status_msg.edit_text(response, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)
        
    except Exception as e:
        logger.error(f"Forwarded messages processing error: {e}")
        try:
            await status_msg.edit_text("вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
        except:
            await bot.send_message(chat_id, "вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")


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
    content = "\n\n".join(captions) if captions else f"рџ“· {len(image_urls)} РёР·РѕР±СЂР°Р¶РµРЅРёР№"

    # Send initial status message
    status_msg = await bot.send_message(chat_id, "рџ“· РћР±СЂР°Р±Р°С‚С‹РІР°СЋ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ...")
    
    try:
        # Extract URLs from all messages and add to content
        all_urls = []
        for msg in messages:
            all_urls.extend(extract_urls_from_message(msg))
        if all_urls:
            content += "\n\n" + "\n".join(all_urls)
        
        # Generate title (and summary) via DeepSeek when allowed
        title, summary = None, None
        can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
        if can_summarize and len(content.strip()) >= 10:
            await status_msg.edit_text("вњЁ РЎРѕР·РґР°СЋ Р·Р°РіРѕР»РѕРІРѕРє Рё СЃР°РјРјР°СЂРё...")
            title, summary = await summarizer_service.summarize_with_title(content, user.language_code)
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
            ),
            user_language=user.language_code
        )
        
        # Index for RAG
        await rag_service.index_note(str(note.id), str(user.id), content)
        
        # Final response with button
        response = f"вњ… **РЎРѕС…СЂР°РЅРµРЅРѕ {len(image_urls)} С„РѕС‚Рѕ РєР°Рє Р·Р°РјРµС‚РєР°!**"
        if title:
            response += f"\n\nрџ“Њ **{title}**"
        if summary:
            response += f"\n\nрџ’Ў **РЎР°РјРјР°СЂРё:**\n{summary[:200]}{'...' if len(summary) > 200 else ''}"
        elif not can_summarize:
            response += "\n\n_рџ’Ў AI-СЃР°РјРјР°СЂРё РЅРµРґРѕСЃС‚СѓРїРЅРѕ РЅР° РІР°С€РµРј РїР»Р°РЅРµ_"
        
        keyboard = get_note_open_keyboard(str(note.id))
        await status_msg.edit_text(response, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)
        
    except Exception as e:
        logger.error(f"Media group processing error: {e}")
        try:
            await status_msg.edit_text("вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
        except:
            await bot.send_message(chat_id, "вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")


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
        text.lower().startswith(("С‡С‚Рѕ ", "РєР°Рє ", "РіРґРµ ", "РєРѕРіРґР° ", "РїРѕС‡РµРјСѓ ", "РєС‚Рѕ ", "РєР°РєРѕР№ ", "СЃРєРѕР»СЊРєРѕ "))
    )
    
    if is_question and len(text) < 200:
        # Check subscription for AI chat feature
        can_use, _, _ = await notes_service.can_use_feature(user.id, "chat")
        
        if not can_use:
            # Can't use AI - just save as note
            await save_text_note(message, user, text)
            return
        
        # Treat as AI query - edit single message
        status_msg = await message.answer("рџ”Ќ РС‰Сѓ РѕС‚РІРµС‚ РІ Р·Р°РјРµС‚РєР°С…...")
        
        try:
            results = await asyncio.wait_for(
                rag_service.search_with_threshold(
                    query=text,
                    user_id=str(user.id),
                    limit=5,
                    min_similarity=0.2
                ),
                timeout=25.0,
            )
        except asyncio.TimeoutError:
            await status_msg.edit_text("РЎР»РёС€РєРѕРј РґРѕР»РіРёР№ РїРѕРёСЃРє РїРѕ Р·Р°РјРµС‚РєР°Рј. РџРѕРїСЂРѕР±СѓР№ РїРѕРІС‚РѕСЂРёС‚СЊ Р·Р°РїСЂРѕСЃ.")
            return
        except Exception as e:
            logger.error(f"Text RAG search failed: {e}")
            await status_msg.edit_text("РћС€РёР±РєР° РїРѕРёСЃРєР° РїРѕ Р·Р°РјРµС‚РєР°Рј. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
            return
        
        if results:
            context = [
                {
                    "content": r.content,
                    "summary": r.summary,
                    "similarity": r.similarity
                }
                for r in results
            ]
            await status_msg.edit_text("Р¤РѕСЂРјРёСЂСѓСЋ РѕС‚РІРµС‚...")
            try:
                answer = await asyncio.wait_for(
                    summarizer_service.ask(text, context),
                    timeout=45.0,
                )
            except asyncio.TimeoutError:
                await status_msg.edit_text("Р“РµРЅРµСЂР°С†РёСЏ РѕС‚РІРµС‚Р° Р·Р°РЅСЏР»Р° СЃР»РёС€РєРѕРј РјРЅРѕРіРѕ РІСЂРµРјРµРЅРё. РџРѕРїСЂРѕР±СѓР№ РµС‰Рµ СЂР°Р·.")
                return
            except Exception as e:
                logger.error(f"Text RAG answer generation failed: {e}")
                await status_msg.edit_text("РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё РѕС‚РІРµС‚Р°. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
                return
            
            # Track chat usage
            await notes_service.increment_usage(user.id, "chat_messages", 1)
            
            await status_msg.edit_text(format_ai_answer_html(answer), parse_mode=ParseMode.HTML)
        else:
            # No results - save as note instead
            await status_msg.delete()
            await save_text_note(message, user, text)
    else:
        # Save as note
        await save_text_note(message, user, text)


async def save_text_note(message: Message, user, text: str):
    """Save text as a note. Generate title (and summary) via DeepSeek when allowed."""
    # Send initial status message
    status_msg = await message.answer("рџ“ќ РЎРѕС…СЂР°РЅСЏСЋ Р·Р°РјРµС‚РєСѓ...")
    
    try:
        # Extract URLs from message entities and add to content
        urls = extract_urls_from_message(message)
        if urls:
            text += "\n\n" + "\n".join(urls)
        
        title, summary = None, None
        can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
        if can_summarize and len(text.strip()) >= 10:
            await status_msg.edit_text("вњЁ РЎРѕР·РґР°СЋ Р·Р°РіРѕР»РѕРІРѕРє Рё СЃР°РјРјР°СЂРё...")
            title, summary = await summarizer_service.summarize_with_title(text, user.language_code)
            if title or summary:
                await notes_service.increment_usage(user.id, "summaries", 1)

        note = await notes_service.create_note(
            user_id=user.id,
            note_data=NoteCreate(
                content=text,
                title=title,
                summary=summary,
                source="text"
            ),
            user_language=user.language_code
        )

        # Index for RAG
        await rag_service.index_note(str(note.id), str(user.id), text)

        # Final response with button to open note
        response = "вњ… **Р—Р°РјРµС‚РєР° СЃРѕС…СЂР°РЅРµРЅР°!**"
        if title:
            response += f"\n\nрџ“Њ **{title}**"
        if summary:
            response += f"\n\nрџ’Ў **РЎР°РјРјР°СЂРё:**\n{summary[:200]}{'...' if len(summary) > 200 else ''}"
        elif not can_summarize:
            response += "\n\n_рџ’Ў AI-СЃР°РјРјР°СЂРё РЅРµРґРѕСЃС‚СѓРїРЅРѕ РЅР° РІР°С€РµРј РїР»Р°РЅРµ_"
        
        keyboard = get_note_open_keyboard(str(note.id))
        await status_msg.edit_text(response, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)
        
    except Exception as e:
        logger.error(f"Text note save error: {e}")
        try:
            await status_msg.edit_text("вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
        except:
            await message.answer("вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")


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
        await message.answer("вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ")
        return
    
    # Get file URL
    url = await get_telegram_file_url(largest.file_id)
    if not url:
        await message.answer("вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ URL РёР·РѕР±СЂР°Р¶РµРЅРёСЏ")
        return
    
    # Get caption or use default
    content = message.caption.strip() if message.caption else "рџ“· РР·РѕР±СЂР°Р¶РµРЅРёРµ"
    
    # Send initial status message
    status_msg = await message.answer("рџ“· РћР±СЂР°Р±Р°С‚С‹РІР°СЋ РёР·РѕР±СЂР°Р¶РµРЅРёРµ...")
    
    try:
        # Extract URLs from message entities and add to content
        urls = extract_urls_from_message(message)
        if urls:
            content += "\n\n" + "\n".join(urls)
        
        # Generate title (and summary) via DeepSeek when allowed
        title, summary = None, None
        can_summarize, _, _ = await notes_service.can_use_feature(user.id, "summary")
        if can_summarize and len(content.strip()) >= 10:
            await status_msg.edit_text("вњЁ РЎРѕР·РґР°СЋ Р·Р°РіРѕР»РѕРІРѕРє Рё СЃР°РјРјР°СЂРё...")
            title, summary = await summarizer_service.summarize_with_title(content, user.language_code)
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
                images=[url]
            ),
            user_language=user.language_code
        )
        
        # Index for RAG
        await rag_service.index_note(str(note.id), str(user.id), content)
        
        # Final response with button
        response = "вњ… **Р—Р°РјРµС‚РєР° СЃРѕС…СЂР°РЅРµРЅР°!**"
        if title:
            response += f"\n\nрџ“Њ **{title}**"
        if summary:
            response += f"\n\nрџ’Ў **РЎР°РјРјР°СЂРё:**\n{summary[:200]}{'...' if len(summary) > 200 else ''}"
        elif not can_summarize:
            response += "\n\n_рџ’Ў AI-СЃР°РјРјР°СЂРё РЅРµРґРѕСЃС‚СѓРїРЅРѕ РЅР° РІР°С€РµРј РїР»Р°РЅРµ_"
        
        keyboard = get_note_open_keyboard(str(note.id))
        await status_msg.edit_text(response, parse_mode=ParseMode.MARKDOWN, reply_markup=keyboard)
        
    except Exception as e:
        logger.error(f"Photo processing error: {e}")
        try:
            await status_msg.edit_text("вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")
        except:
            await message.answer("вќЊ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.")


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
    
    # Parse payload: sub:v1:user_id:plan:billing_period:nonce
    try:
        payload_parts = payment.invoice_payload.split(":")
        billing_period = "monthly"
        if len(payload_parts) >= 6 and payload_parts[0] == "sub":
            # New payload format: sub:v1:user_id:plan:billing_period:nonce
            user_uuid = payload_parts[2]
            plan = payload_parts[3]
            billing_period = payload_parts[4] or "monthly"
        elif len(payload_parts) >= 5 and payload_parts[0] == "sub":
            # Backward compatibility for early v1 payload without explicit billing_period
            user_uuid = payload_parts[2]
            plan = payload_parts[3]
        elif len(payload_parts) >= 3:
            # Backward compatibility with old payload format: user_id:plan:billing_period:nonce
            user_uuid = payload_parts[0]
            plan = payload_parts[1]
            billing_period = payload_parts[2] or "monthly"
        else:
            logger.error(f"Invalid payment payload: {payment.invoice_payload}")
            return

        # New Bot API fields for recurring payments
        subscription_expiration_ts = getattr(payment, "subscription_expiration_date", None)
        is_recurring = bool(getattr(payment, "is_recurring", False))
        is_first_recurring = bool(getattr(payment, "is_first_recurring", False))

        # Fallback for older aiogram versions
        if hasattr(payment, "model_extra") and isinstance(payment.model_extra, dict):
            subscription_expiration_ts = payment.model_extra.get(
                "subscription_expiration_date",
                subscription_expiration_ts,
            )
            is_recurring = bool(payment.model_extra.get("is_recurring", is_recurring))
            is_first_recurring = bool(payment.model_extra.get("is_first_recurring", is_first_recurring))

        expires_at = None
        if subscription_expiration_ts:
            expires_at = datetime.utcfromtimestamp(int(subscription_expiration_ts))

        # Activate/extend subscription and store payment metadata
        success = await notes_service.activate_subscription(
            user_id=user_uuid,
            plan=plan,
            billing_period=billing_period,
            subscription_expires_at=expires_at,
            payment_data={
                "invoice_payload": payment.invoice_payload,
                "telegram_payment_charge_id": payment.telegram_payment_charge_id,
                "provider_payment_charge_id": payment.provider_payment_charge_id,
                "amount": payment.total_amount,
                "currency": payment.currency,
                "subscription_period": 30 * 24 * 60 * 60 if billing_period == "monthly" else None,
                "is_recurring": is_recurring,
                "is_first_recurring": is_first_recurring,
            },
        )
        
        if success:
            # Get plan name for message
            plan_names = {
                "pro": "Pro в­ђпёЏ",
                "ultra": "Ultra рџ’Ћ"
            }
            plan_name = plan_names.get(plan, plan.title())
            
            if billing_period == "yearly":
                payment_kind = "Р“РѕРґРѕРІР°СЏ РїРѕРґРїРёСЃРєР° РѕРїР»Р°С‡РµРЅР° Рё Р°РєС‚РёРІРёСЂРѕРІР°РЅР°."
            elif is_recurring and not is_first_recurring:
                payment_kind = "РџР»Р°С‚РµР¶ РїСЂРѕРґР»РёР» РІР°С€Сѓ РїРѕРґРїРёСЃРєСѓ РЅР° СЃР»РµРґСѓСЋС‰РёР№ РїРµСЂРёРѕРґ."
            elif is_first_recurring:
                payment_kind = "Р•Р¶РµРјРµСЃСЏС‡РЅР°СЏ РїРѕРґРїРёСЃРєР° СѓСЃРїРµС€РЅРѕ Р°РєС‚РёРІРёСЂРѕРІР°РЅР°."
            else:
                payment_kind = "РџР»Р°С‚РµР¶ СѓСЃРїРµС€РЅРѕ РїРѕР»СѓС‡РµРЅ."

            await message.answer(
                f"рџЋ‰ **РџРѕРґРїРёСЃРєР° {plan_name} Р°РєС‚РёРІРёСЂРѕРІР°РЅР°!**\n\n"
                f"{payment_kind}\n"
                f"РЎРїР°СЃРёР±Рѕ Р·Р° РїРѕРґРґРµСЂР¶РєСѓ! вќ¤пёЏ",
                parse_mode=ParseMode.MARKDOWN
            )

            logger.info(
                "Subscription activated: user=%s, plan=%s, recurring=%s, first=%s, expires=%s",
                user_uuid,
                plan,
                is_recurring,
                is_first_recurring,
                subscription_expiration_ts,
            )
        else:
            await message.answer(
                "вљ пёЏ РџР»Р°С‚С‘Р¶ РїРѕР»СѓС‡РµРЅ, РЅРѕ РІРѕР·РЅРёРєР»Р° РѕС€РёР±РєР° РїСЂРё Р°РєС‚РёРІР°С†РёРё РїРѕРґРїРёСЃРєРё. "
                "РџРѕР¶Р°Р»СѓР№СЃС‚Р°, СЃРІСЏР¶РёС‚РµСЃСЊ СЃ РїРѕРґРґРµСЂР¶РєРѕР№."
            )
            logger.error(f"Failed to activate subscription: user={user_uuid}, plan={plan}")
            
    except Exception as e:
        logger.error(f"Payment processing error: {e}")
        await message.answer(
            "вљ пёЏ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё РѕР±СЂР°Р±РѕС‚РєРµ РїР»Р°С‚РµР¶Р°. "
            "РџРѕР¶Р°Р»СѓР№СЃС‚Р°, СЃРІСЏР¶РёС‚РµСЃСЊ СЃ РїРѕРґРґРµСЂР¶РєРѕР№."
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



