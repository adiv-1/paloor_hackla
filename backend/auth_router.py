from __future__ import annotations

import os
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response
from auth import (
    RegisterRequest, LoginRequest, TokenResponse, ProfileUpdate, VerifyRequest,
    UserInfo, register, authenticate, create_token, get_current_user,
    get_user_record, update_profile, send_verification_email, verify_email_code,
    _user_to_full_dict,
)
from database import pg_cursor
from storage import put_bytes, get_bytes, delete_object

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


@auth_router.post("/register", response_model=TokenResponse)
def register_user(body: RegisterRequest):
    if not body.email or not body.password:
        raise HTTPException(400, "Email and password required")
    if len(body.password) < 4:
        raise HTTPException(400, "Password must be at least 4 characters")
    try:
        user = register(body.email, body.password, body.name)
    except ValueError as e:
        raise HTTPException(409, str(e))

    # Send verification email (non-blocking — we don't fail registration if email fails)
    if "@" in body.email:
        send_verification_email(body.email)

    token = create_token(user)
    return TokenResponse(
        access_token=token,
        user=_user_to_full_dict(user),
    )


@auth_router.post("/login", response_model=TokenResponse)
def login_user(body: LoginRequest):
    user = authenticate(body.email, body.password)
    if not user:
        raise HTTPException(401, "Invalid credentials")
    token = create_token(user)
    return TokenResponse(
        access_token=token,
        user=_user_to_full_dict(user),
    )


@auth_router.post("/verify-email")
def verify_email(body: VerifyRequest):
    if verify_email_code(body.email, body.code):
        return {"status": "verified"}
    raise HTTPException(400, "Invalid or expired code")


@auth_router.post("/resend-code")
def resend_code(body: VerifyRequest):
    """Resend verification email. Pass any value for code (ignored)."""
    if send_verification_email(body.email):
        return {"status": "sent"}
    raise HTTPException(500, "Failed to send email")


@auth_router.get("/me")
def get_me(user: UserInfo = Depends(get_current_user)):
    record = get_user_record(user.id)
    if not record:
        raise HTTPException(404, "User not found")
    return _user_to_full_dict(record)


@auth_router.put("/profile")
def update_user_profile(
    body: ProfileUpdate,
    user: UserInfo = Depends(get_current_user),
):
    result = update_profile(user.id, body)
    if not result:
        raise HTTPException(404, "User not found")
    return result


@auth_router.post("/photo")
async def upload_photo(
    user: UserInfo = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """Upload a profile photo."""
    content = await file.read()
    ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
    object_key = f"photos/{user.id}{ext}"
    put_bytes(object_key, content, file.content_type or "image/jpeg")

    record = get_user_record(user.id)
    old_key = record.get("photo_path") if record else None
    if old_key and old_key != object_key:
        try:
            delete_object(old_key)
        except Exception:
            pass

    with pg_cursor() as cur:
        cur.execute("UPDATE users SET photo_path = %s WHERE id = %s", (object_key, user.id))
    return {"status": "uploaded", "photo_url": f"/api/auth/photo/{user.id}"}


@auth_router.get("/photo/{user_id}")
def get_photo(user_id: str):
    record = get_user_record(user_id)
    if not record or not record.get("photo_path"):
        raise HTTPException(404, "No photo")
    import mimetypes
    path = record["photo_path"]
    mime, _ = mimetypes.guess_type(path)
    try:
        content = get_bytes(path)
    except FileNotFoundError:
        raise HTTPException(404, "No photo")
    return Response(content=content, media_type=mime or "image/jpeg")
