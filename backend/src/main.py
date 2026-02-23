import asyncio
import logging
import uvicorn
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .config import settings
from .api import router as api_router, set_bot_instance
from .auth_native import router as auth_native_router
from .bot import start_bot, stop_bot, dp, bot
from .scheduler import start_scheduler, stop_scheduler

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
    
    # Pass bot instance to API for sending messages
    set_bot_instance(bot)
    
    # Start bot in background
    logger.info("Starting Telegram bot...")
    bot_task = asyncio.create_task(start_bot())
    
    # Start background scheduler for auto-sync
    logger.info("Starting background scheduler...")
    start_scheduler()
    
    yield
    
    # Stop scheduler
    logger.info("Stopping background scheduler...")
    stop_scheduler()
    
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

# Include API routers
app.include_router(auth_native_router)
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


@app.get("/api/telegram-auth", response_class=HTMLResponse)
async def telegram_auth_page():
    """
    Serve the Telegram Login Widget page for the native app.
    Loaded in a WebView — the domain (fixnote.space) must match
    what is configured in BotFather via /setdomain.
    """
    bot_username = settings.telegram_bot_username
    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Telegram Login</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f0f0f2;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }}
    .container {{
      text-align: center;
      padding: 40px 32px;
    }}
    h2 {{ color: #29333F; margin-bottom: 12px; font-size: 22px; }}
    p {{ color: #8C9198; margin-bottom: 28px; font-size: 15px; line-height: 1.4; }}
  </style>
</head>
<body>
  <div class="container">
    <h2>Войти через Telegram</h2>
    <p>Нажмите кнопку ниже для входа через Telegram</p>
    <script
      async
      src="https://telegram.org/js/telegram-widget.js?22"
      data-telegram-login="{bot_username}"
      data-size="large"
      data-radius="10"
      data-onauth="onTelegramAuth(user)"
      data-request-access="write">
    </script>
    <script>
      function onTelegramAuth(user) {{
        if (window.ReactNativeWebView) {{
          window.ReactNativeWebView.postMessage(JSON.stringify(user));
        }}
      }}
    </script>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)


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
