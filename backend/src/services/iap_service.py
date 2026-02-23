"""
In-App Purchase (IAP) verification service.
Handles Apple App Store and Google Play Billing receipt/token verification.
"""
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

APPLE_VERIFY_URL = "https://buy.itunes.apple.com/verifyReceipt"
APPLE_SANDBOX_VERIFY_URL = "https://sandbox.itunes.apple.com/verifyReceipt"

PRODUCT_PLAN_MAP = {
    "fixnote.pro.monthly": ("pro", "monthly"),
    "fixnote.pro.yearly": ("pro", "yearly"),
    "fixnote.ultra.monthly": ("ultra", "monthly"),
    "fixnote.ultra.yearly": ("ultra", "yearly"),
}


@dataclass
class SubscriptionUpdate:
    plan: str  # 'pro' | 'ultra'
    billing_period: str  # 'monthly' | 'yearly'
    expires_at: Optional[datetime]
    is_recurring: bool = True
    transaction_id: Optional[str] = None
    purchase_token: Optional[str] = None


class IAPService:
    async def verify_apple_receipt(
        self,
        receipt_data: str,
        product_id: str,
        transaction_id: str,
    ) -> SubscriptionUpdate:
        """
        Verify Apple App Store receipt.
        Falls back to sandbox on status 21007.
        """
        if not settings.apple_iap_shared_secret:
            logger.warning("Apple IAP shared secret not configured, skipping verification")
            return self._subscription_update_from_product(product_id, transaction_id)

        payload = {
            "receipt-data": receipt_data,
            "password": settings.apple_iap_shared_secret,
            "exclude-old-transactions": True,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(APPLE_VERIFY_URL, json=payload)
            data = resp.json()

            # Sandbox receipt sent to production
            if data.get("status") == 21007:
                resp = await client.post(APPLE_SANDBOX_VERIFY_URL, json=payload)
                data = resp.json()

        status = data.get("status", -1)
        if status != 0:
            raise ValueError(f"Apple receipt verification failed with status {status}")

        # Find the matching transaction in latest_receipt_info
        latest_receipts = data.get("latest_receipt_info", [])
        matching = None
        for receipt in latest_receipts:
            if receipt.get("product_id") == product_id:
                matching = receipt
                break

        if not matching and latest_receipts:
            matching = latest_receipts[0]

        expires_at = None
        if matching and matching.get("expires_date_ms"):
            expires_ms = int(matching["expires_date_ms"])
            expires_at = datetime.fromtimestamp(expires_ms / 1000, tz=timezone.utc)

        plan, billing_period = PRODUCT_PLAN_MAP.get(product_id, ("pro", "monthly"))
        return SubscriptionUpdate(
            plan=plan,
            billing_period=billing_period,
            expires_at=expires_at,
            is_recurring=True,
            transaction_id=transaction_id,
        )

    async def verify_google_purchase(
        self,
        purchase_token: str,
        product_id: str,
        order_id: str,
    ) -> SubscriptionUpdate:
        """
        Verify Google Play subscription purchase.
        Uses Google Play Developer API with service account.
        """
        if not settings.google_service_account_key or not settings.google_play_package_name:
            logger.warning("Google Play credentials not configured, skipping verification")
            return self._subscription_update_from_product(product_id, order_id)

        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build

            credentials_info = json.loads(settings.google_service_account_key)
            credentials = service_account.Credentials.from_service_account_info(
                credentials_info,
                scopes=["https://www.googleapis.com/auth/androidpublisher"],
            )

            service = build("androidpublisher", "v3", credentials=credentials)
            result = (
                service.purchases()
                .subscriptions()
                .get(
                    packageName=settings.google_play_package_name,
                    subscriptionId=product_id,
                    token=purchase_token,
                )
                .execute()
            )

            expires_ms = int(result.get("expiryTimeMillis", 0))
            expires_at = (
                datetime.fromtimestamp(expires_ms / 1000, tz=timezone.utc)
                if expires_ms
                else None
            )

            plan, billing_period = PRODUCT_PLAN_MAP.get(product_id, ("pro", "monthly"))
            return SubscriptionUpdate(
                plan=plan,
                billing_period=billing_period,
                expires_at=expires_at,
                is_recurring=True,
                transaction_id=order_id,
                purchase_token=purchase_token,
            )

        except Exception as e:
            logger.error(f"Google Play verification error: {e}")
            raise ValueError(f"Google Play verification failed: {e}")

    def _subscription_update_from_product(
        self, product_id: str, transaction_id: Optional[str]
    ) -> SubscriptionUpdate:
        """Fallback when credentials are not configured (dev mode)."""
        from datetime import timedelta
        plan, billing_period = PRODUCT_PLAN_MAP.get(product_id, ("pro", "monthly"))
        days = 365 if billing_period == "yearly" else 31
        expires_at = datetime.now(tz=timezone.utc) + timedelta(days=days)
        return SubscriptionUpdate(
            plan=plan,
            billing_period=billing_period,
            expires_at=expires_at,
            is_recurring=True,
            transaction_id=transaction_id,
        )
