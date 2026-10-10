import hashlib

from cryptography.fernet import Fernet


class FieldEncryptor:
    """Application-level encryption for secrets stored in the database."""

    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode())
        # Separate derived key for HMACs so the encryption key itself is never used twice.
        self.hmac_key = hashlib.sha256(b"taproga-hmac:" + key.encode()).digest()

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        return self._fernet.decrypt(ciphertext.encode()).decode()
