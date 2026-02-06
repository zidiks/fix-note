"""Services module (lazy imports to avoid side effects at import time)."""

__all__ = [
    "NotesService",
    "TranscriptionService",
    "SummarizerService",
    "RAGService",
]


def __getattr__(name: str):
    if name == "NotesService":
        from .notes_service import NotesService
        return NotesService
    if name == "TranscriptionService":
        from .transcription import TranscriptionService
        return TranscriptionService
    if name == "SummarizerService":
        from .summarizer import SummarizerService
        return SummarizerService
    if name == "RAGService":
        from .rag_service import RAGService
        return RAGService
    raise AttributeError(name)


