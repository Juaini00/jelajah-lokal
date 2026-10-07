import hashlib
import hmac
import secrets

from pwdlib import PasswordHash

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hash.verify(password, password_hash)
    except Exception:
        return False


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode('utf-8'), b.encode('utf-8'))
