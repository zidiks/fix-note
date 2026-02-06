import base64
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives import hashes, hmac
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

class NotesCryptoError(Exception):
    """Raised when note encryption/decryption fails."""


@dataclass(frozen=True)
class DerivedKeys:
    enc_key: bytes
    hash_key: bytes


class NotesCrypto:
    """Crypto utilities for note encryption."""

    _HKDF_SALT = b"fix-note-notes"
    _HKDF_INFO = b"notes-v1"
    _VERSION = "v1"

    def __init__(self, master_key: bytes, master_key_version: int = 1):
        if not master_key or len(master_key) != 32:
            raise ValueError("NOTES_MASTER_KEY must decode to 32 bytes")
        self._master_key = master_key
        self.master_key_version = master_key_version

    @classmethod
    def from_settings(cls) -> "NotesCrypto":
        from ..config import settings
        return cls(settings.notes_master_key_bytes, settings.notes_master_key_version)

    def generate_data_key(self) -> bytes:
        return os.urandom(32)

    def derive_keys(self, data_key: bytes) -> DerivedKeys:
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=64,
            salt=self._HKDF_SALT,
            info=self._HKDF_INFO,
        )
        okm = hkdf.derive(data_key)
        return DerivedKeys(enc_key=okm[:32], hash_key=okm[32:])

    def encrypt_text(self, plaintext: str, enc_key: bytes, aad: str) -> str:
        if plaintext is None:
            raise NotesCryptoError("Cannot encrypt None")
        aesgcm = AESGCM(enc_key)
        nonce = os.urandom(12)
        data = plaintext.encode("utf-8")
        ct = aesgcm.encrypt(nonce, data, aad.encode("utf-8"))
        payload = nonce + ct
        return f"{self._VERSION}:{base64.b64encode(payload).decode('utf-8')}"

    def decrypt_text(self, ciphertext: str, enc_key: bytes, aad: str) -> str:
        if not ciphertext:
            raise NotesCryptoError("Ciphertext is empty")
        if not ciphertext.startswith(f"{self._VERSION}:"):
            raise NotesCryptoError("Unsupported ciphertext version")
        payload_b64 = ciphertext.split(":", 1)[1]
        payload = base64.b64decode(payload_b64)
        if len(payload) < 13:
            raise NotesCryptoError("Ciphertext payload too short")
        nonce = payload[:12]
        ct = payload[12:]
        aesgcm = AESGCM(enc_key)
        data = aesgcm.decrypt(nonce, ct, aad.encode("utf-8"))
        return data.decode("utf-8")

    def wrap_data_key(self, data_key: bytes, aad: str) -> str:
        aesgcm = AESGCM(self._master_key)
        nonce = os.urandom(12)
        ct = aesgcm.encrypt(nonce, data_key, aad.encode("utf-8"))
        payload = nonce + ct
        return f"{self._VERSION}:{base64.b64encode(payload).decode('utf-8')}"

    def unwrap_data_key(self, wrapped: str, aad: str) -> bytes:
        if not wrapped:
            raise NotesCryptoError("Wrapped key is empty")
        if not wrapped.startswith(f"{self._VERSION}:"):
            raise NotesCryptoError("Unsupported wrapped key version")
        payload_b64 = wrapped.split(":", 1)[1]
        payload = base64.b64decode(payload_b64)
        if len(payload) < 13:
            raise NotesCryptoError("Wrapped key payload too short")
        nonce = payload[:12]
        ct = payload[12:]
        aesgcm = AESGCM(self._master_key)
        return aesgcm.decrypt(nonce, ct, aad.encode("utf-8"))

    def hash_text(self, plaintext: str, hash_key: bytes) -> str:
        if plaintext is None:
            raise NotesCryptoError("Cannot hash None")
        h = hmac.HMAC(hash_key, hashes.SHA256())
        h.update(plaintext.encode("utf-8"))
        return h.finalize().hex()
