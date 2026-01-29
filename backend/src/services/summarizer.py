import logging
from typing import Optional, List
from openai import AsyncOpenAI

from ..config import settings

logger = logging.getLogger(__name__)


SUMMARY_SYSTEM_PROMPT = """Ты — AI-ассистент для создания кратких саммари голосовых заметок.

Правила:
1. Создавай краткое саммари на 2-3 предложения
2. Сохраняй ключевые идеи и факты
3. Используй тот же язык, что и в оригинале
4. Не добавляй информацию, которой нет в тексте
5. Начинай сразу с саммари, без вступлений типа "В этой заметке..."
"""

RAG_SYSTEM_PROMPT = """Ты — AI-ассистент, который отвечает на вопросы пользователя на основе его заметок.

Контекст из заметок пользователя будет предоставлен ниже. Используй только информацию из этого контекста для ответа.

Правила:
1. Отвечай только на основе предоставленного контекста
2. Если информации недостаточно, честно скажи об этом
3. Отвечай на том же языке, на котором задан вопрос
4. Будь кратким и информативным
5. Если релевантных заметок нет, предложи создать новую заметку
"""


class SummarizerService:
    """Service for AI summarization and RAG responses using DeepSeek."""
    
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_api_url
        )
        self.model = "deepseek-chat"
    
    async def summarize(self, text: str) -> Optional[str]:
        """
        Create a summary of the text.
        
        Args:
            text: Text to summarize
            
        Returns:
            Summary or None if failed
        """
        if not text or len(text.strip()) < 20:
            return None
            
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Создай краткое саммари:\n\n{text}"}
                ],
                max_tokens=500,
                temperature=0.3
            )
            
            summary = response.choices[0].message.content
            logger.info(f"Summary created: {len(summary)} chars")
            return summary.strip()
            
        except Exception as e:
            logger.error(f"Summarization error: {e}")
            return None
    
    async def ask(self, question: str, context_notes: List[dict]) -> str:
        """
        Answer a question based on context from notes.
        
        Args:
            question: User's question
            context_notes: List of relevant notes with content and similarity
            
        Returns:
            AI response
        """
        if not context_notes:
            return "К сожалению, я не нашёл релевантных заметок для ответа на этот вопрос. Попробуйте переформулировать вопрос или создайте новую заметку с нужной информацией."
        
        # Build context from notes
        context_parts = []
        for i, note in enumerate(context_notes, 1):
            content = note.get("content", "")
            summary = note.get("summary", "")
            similarity = note.get("similarity", 0)
            
            text = summary if summary else content[:500]
            context_parts.append(f"[Заметка {i}] (релевантность: {similarity:.0%})\n{text}")
        
        context = "\n\n".join(context_parts)
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": RAG_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Контекст из заметок:\n\n{context}\n\n---\n\nВопрос: {question}"}
                ],
                max_tokens=1000,
                temperature=0.5
            )
            
            answer = response.choices[0].message.content
            logger.info(f"RAG answer created: {len(answer)} chars")
            return answer.strip()
            
        except Exception as e:
            logger.error(f"RAG error: {e}")
            return "Произошла ошибка при генерации ответа. Попробуйте позже."
    
    async def health_check(self) -> bool:
        """Check if DeepSeek API is available."""
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5
            )
            return True
        except Exception:
            return False


