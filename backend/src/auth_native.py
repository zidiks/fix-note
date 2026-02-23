"""
Native app authentication endpoints.
Provides JWT-based auth for Apple Sign In, Google Sign In, and Telegram Login Widget.
These are separate from the existing Telegram WebApp initData auth.
"""
import hashlib
import hmac
import json
import logging
import time
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .config import settings
from .services.notes_service import NotesService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth-native"])
notes_service = NotesService()


# ──────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────

class TelegramNativeAuthRequest(BaseModel):
    """Data from Telegram Login Widget (different from WebApp initData)."""
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


class AppleAuthRequest(BaseModel):
    identity_token: str  # JWT from Apple
    user_data: Optional[dict] = None  # {email, fullName} - only on first login


class GoogleAuthRequest(BaseModel):
    id_token: str  # JWT from Google


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ──────────────────────────────────────────────
# JWT helpers
# ──────────────────────────────────────────────

def create_jwt(user_id: str, telegram_id: Optional[int] = None) -> str:
    """Create a JWT for native app authentication."""
    if not settings.jwt_secret:
        raise HTTPException(500, "JWT secret not configured")

    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "tid": telegram_id,
        "iat": now,
        "exp": now + settings.jwt_expire_days * 86400,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def user_to_dict(user) -> dict:
    """Convert User model to public dict."""
    from .db.models import User as UserModel
    if isinstance(user, UserModel):
        return {
            "id": str(user.id),
            "telegram_id": user.telegram_id,
            "username": user.username,
            "first_name": user.first_name,
            "display_name": getattr(user, "display_name", None) or user.first_name,
            "email": getattr(user, "email", None),
            "language_code": user.language_code,
            "auth_provider": getattr(user, "auth_provider", "telegram"),
        }
    # Fallback for plain dict
    return {
        "id": str(user.get("id", "")),
        "telegram_id": user.get("telegram_id"),
        "username": user.get("username"),
        "first_name": user.get("first_name"),
        "display_name": user.get("display_name") or user.get("first_name"),
        "email": user.get("email"),
        "language_code": user.get("language_code"),
        "auth_provider": user.get("auth_provider", "telegram"),
    }


# ──────────────────────────────────────────────
# Telegram Login Widget validation
# ──────────────────────────────────────────────

def validate_telegram_login_widget(data: TelegramNativeAuthRequest) -> bool:
    """
    Validate Telegram Login Widget data using HMAC-SHA256.
    This is different from WebApp initData validation.
    Docs: https://core.telegram.org/widgets/login#checking-authorization
    """
    # Check auth_date is recent (within 1 day)
    if time.time() - data.auth_date > 86400:
        return False

    # Build check string (all fields except hash, sorted alphabetically)
    check_parts = {
        "auth_date": str(data.auth_date),
        "first_name": data.first_name,
        "id": str(data.id),
    }
    if data.last_name:
        check_parts["last_name"] = data.last_name
    if data.photo_url:
        check_parts["photo_url"] = data.photo_url
    if data.username:
        check_parts["username"] = data.username

    check_string = "\n".join(f"{k}={v}" for k, v in sorted(check_parts.items()))

    # Secret key = SHA256(bot_token)
    secret_key = hashlib.sha256(settings.telegram_bot_token.encode()).digest()
    computed = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()

    return hmac.compare_digest(computed, data.hash)


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@router.post("/telegram-native", response_model=AuthResponse)
async def login_with_telegram_native(request: TelegramNativeAuthRequest):
    """
    Authenticate using Telegram Login Widget data.
    Called from the native app's TelegramAuthScreen WebView.
    """
    if not validate_telegram_login_widget(request):
        raise HTTPException(401, "Invalid Telegram auth data")

    user = await notes_service.get_or_create_user(
        telegram_id=request.id,
        username=request.username,
        first_name=request.first_name,
        language_code="ru",
    )

    token = create_jwt(str(user.id), telegram_id=request.id)
    return AuthResponse(access_token=token, user=user_to_dict(user))


@router.post("/apple", response_model=AuthResponse)
async def login_with_apple(request: AppleAuthRequest):
    """
    Authenticate using Apple Sign In identity token.
    Verifies the token with Apple's public keys, creates/finds user by apple_sub.
    """
    try:
        # Fetch Apple's public JWKS
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://appleid.apple.com/auth/keys", timeout=10)
            resp.raise_for_status()
            jwks = resp.json()

        # Decode without verification first to get the key ID
        unverified_header = jwt.get_unverified_header(request.identity_token)
        kid = unverified_header.get("kid")

        # Find matching public key
        matching_key = None
        for key_data in jwks.get("keys", []):
            if key_data.get("kid") == kid:
                matching_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key_data))
                break

        if not matching_key:
            raise HTTPException(401, "Apple public key not found")

        # Verify and decode the identity token.
        # Accept both production bundle ID and Expo Go bundle ID for development.
        accepted_audiences = [settings.apple_bundle_id, "host.exp.exponent"]
        payload = jwt.decode(
            request.identity_token,
            matching_key,
            algorithms=["RS256"],
            audience=accepted_audiences,
            issuer="https://appleid.apple.com",
        )

        apple_sub = payload.get("sub")
        if not apple_sub:
            raise HTTPException(401, "Invalid Apple token: missing sub")

        email = payload.get("email")
        # Apple only sends full name on first login — comes via user_data
        display_name = None
        if request.user_data:
            full_name = request.user_data.get("fullName", {}) or {}
            given = full_name.get("givenName") or ""
            family = full_name.get("familyName") or ""
            name = f"{given} {family}".strip()
            if name:
                display_name = name

        user = await notes_service.get_or_create_user_apple(
            apple_id=apple_sub,
            email=email,
            display_name=display_name,
        )

        token = create_jwt(str(user.id))
        return AuthResponse(access_token=token, user=user_to_dict(user))

    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Apple token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, f"Invalid Apple token: {e}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Apple auth error: {e}")
        raise HTTPException(500, "Apple authentication failed")


@router.post("/google", response_model=AuthResponse)
async def login_with_google(request: GoogleAuthRequest):
    """
    Authenticate using Google ID token.
    Verifies the token with Google's tokeninfo endpoint, creates/finds user by google_sub.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": request.id_token},
                timeout=10,
            )
            if resp.status_code != 200:
                raise HTTPException(401, "Invalid Google ID token")

            token_info = resp.json()

        google_sub = token_info.get("sub")
        if not google_sub:
            raise HTTPException(401, "Invalid Google token: missing sub")

        email = token_info.get("email")
        name = token_info.get("name")
        picture = token_info.get("picture")

        user = await notes_service.get_or_create_user_google(
            google_id=google_sub,
            email=email,
            display_name=name,
        )

        token = create_jwt(str(user.id))
        return AuthResponse(access_token=token, user=user_to_dict(user))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(500, "Google authentication failed")
