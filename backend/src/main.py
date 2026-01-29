import asyncio
import logging
import uvicorn
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .api import router as api_router
from .bot import start_bot, stop_bot, dp, bot

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Bot task
bot_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global bot_task
    
    # Start bot in background
    logger.info("Starting Telegram bot...")
    bot_task = asyncio.create_task(start_bot())
    
    yield
    
    # Stop bot
    logger.info("Stopping Telegram bot...")
    if bot_task:
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass
    await stop_bot()


# Create main app with lifespan
app = FastAPI(
    title="Voice Notes",
    description="Voice Notes Telegram Bot + Mini App",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for Mini App
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Voice Notes",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


def run():
    """Run the application."""
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.api_port,
        reload=False,
        log_level="info"
    )


if __name__ == "__main__":
    run()
