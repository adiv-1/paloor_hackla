from __future__ import annotations

import json
import uuid
import random
import smtplib
import logging
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
from typing import Optional

from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

from config import settings
from database import pg_cursor

SECRET_KEY = settings.jwt_secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_verification_codes: dict = {}  # email -> {code, expires}  (ephemeral — OK in memory)


def _row_to_dict(row: dict) -> dict:
    d = dict(row)
    # Parse financial_goals from JSON string if needed
    if d.get("financial_goals") and isinstance(d["financial_goals"], str):
        try:
            d["financial_goals"] = json.loads(d["financial_goals"])
        except (json.JSONDecodeError, TypeError):
            d["financial_goals"] = None
    # Ensure booleans
    d["email_verified"] = bool(d.get("email_verified"))
    d["profile_completed"] = bool(d.get("profile_completed"))
    return d


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserInfo(BaseModel):
    id: str
    email: str
    name: str


class ProfileUpdate(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None
    occupation: Optional[str] = None
    annual_income: Optional[str] = None
    net_worth_estimate: Optional[str] = None
    financial_goals: Optional[list] = None
    risk_tolerance: Optional[str] = None
    abstraction_level: Optional[str] = None
    dependents: Optional[int] = None
    state: Optional[str] = None


class VerifyRequest(BaseModel):
    email: str
    code: str


def _seed_admin():
    """Ensure the admin account exists in the DB."""
    with pg_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", ("admin",))
        if not cur.fetchone():
            cur.execute(
                """INSERT INTO users (id, email, name, hashed_password, created_at, email_verified, profile_completed)
                   VALUES (%s, %s, %s, %s, %s, TRUE, TRUE)""",
                ("user_admin", "admin", "Admin", pwd_context.hash("admin"), datetime.now(timezone.utc)),
            )
            logger.info("Seeded admin user")


_seed_admin()


def register(email: str, password: str, name: str) -> dict:
    with pg_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            raise ValueError("Email already registered")
        uid = "user_" + uuid.uuid4().hex[:8]
        cur.execute(
            """INSERT INTO users (id, email, name, hashed_password, created_at, email_verified, profile_completed)
               VALUES (%s, %s, %s, %s, %s, FALSE, FALSE)""",
            (uid, email, name or email.split("@")[0], pwd_context.hash(password), datetime.now(timezone.utc)),
        )
        cur.execute("SELECT * FROM users WHERE id = %s", (uid,))
        return _row_to_dict(cur.fetchone())


def authenticate(email: str, password: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            return None
        d = _row_to_dict(row)
        if pwd_context.verify(password, d["hashed_password"]):
            return d
        return None

def create_token(user: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user["id"], "email": user["email"], "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def get_current_user(token: str = Depends(oauth2_scheme)) -> UserInfo:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        with pg_cursor() as cur:
            cur.execute("SELECT id, email, name FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=401, detail="Invalid token")
            return UserInfo(id=row["id"], email=row["email"], name=row["name"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_user_record(user_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        return _row_to_dict(row)


def update_profile(user_id: str, profile: ProfileUpdate) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cur.fetchone():
            return None
        updates = profile.model_dump(exclude_none=True)
        if "financial_goals" in updates and isinstance(updates["financial_goals"], list):
            updates["financial_goals"] = json.dumps(updates["financial_goals"])
        if updates:
            set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
            cur.execute(
                f"UPDATE users SET {set_clause}, profile_completed = TRUE WHERE id = %s",
                (*updates.values(), user_id),
            )
        else:
            cur.execute("UPDATE users SET profile_completed = TRUE WHERE id = %s", (user_id,))
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        return _user_to_full_dict(_row_to_dict(cur.fetchone()))


def _user_to_full_dict(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "email_verified": bool(user.get("email_verified")),
        "profile_completed": bool(user.get("profile_completed")),
        "age": user.get("age"),
        "gender": user.get("gender"),
        "occupation": user.get("occupation"),
        "annual_income": user.get("annual_income"),
        "net_worth_estimate": user.get("net_worth_estimate"),
        "financial_goals": user.get("financial_goals"),
        "risk_tolerance": user.get("risk_tolerance"),
        "abstraction_level": user.get("abstraction_level"),
        "dependents": user.get("dependents"),
        "state": user.get("state"),
        "photo_url": f"/api/auth/photo/{user['id']}" if user.get("photo_path") else None,
    }


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------

def send_verification_email(email: str) -> bool:
    """Generate a 6-digit code and send it via Gmail SMTP."""
    code = f"{random.randint(100000, 999999)}"
    _verification_codes[email] = {
        "code": code,
        "expires": datetime.utcnow() + timedelta(minutes=15),
    }

    if not settings.gmail_address or not settings.gmail_app_password:
        logger.warning("Gmail not configured — verification code: %s", code)
        return True  # Still store the code for testing

    try:
        msg = EmailMessage()
        msg["Subject"] = f"Paloor — Your verification code is {code}"
        msg["From"] = settings.gmail_address
        msg["To"] = email
        msg.set_content(
            f"Hi,\n\nYour Paloor verification code is: {code}\n\n"
            f"This code expires in 15 minutes.\n\n— Paloor"
        )
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(settings.gmail_address, settings.gmail_app_password)
            smtp.send_message(msg)
        logger.info("Verification email sent to %s", email)
        return True
    except Exception as e:
        logger.error("Failed to send email: %s", e)
        return False


def verify_email_code(email: str, code: str) -> bool:
    """Check a verification code. Returns True if valid."""
    entry = _verification_codes.get(email)
    if not entry:
        return False
    if datetime.utcnow() > entry["expires"]:
        del _verification_codes[email]
        return False
    if entry["code"] != code:
        return False
    # Mark user as verified
    with pg_cursor() as cur:
        cur.execute("UPDATE users SET email_verified = TRUE WHERE email = %s", (email,))
    del _verification_codes[email]
    return True
