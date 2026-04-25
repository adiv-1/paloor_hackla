from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Boolean, DateTime, Text, JSON, LargeBinary, ForeignKey, Integer
from sqlalchemy.orm import relationship

from database import Base


def gen_id(prefix: str = "") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}" if prefix else uuid.uuid4().hex[:8]


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: gen_id("user"))
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    assets = relationship("Asset", back_populates="user", cascade="all, delete-orphan")
    account_documents = relationship("AccountDocument", back_populates="user", cascade="all, delete-orphan")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String, primary_key=True, default=lambda: gen_id("asset"))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    asset_class = Column(String, nullable=False)
    name = Column(String, nullable=False)
    details = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="assets")
    documents = relationship("AssetDocument", back_populates="asset", cascade="all, delete-orphan")


class AssetDocument(Base):
    __tablename__ = "asset_documents"

    id = Column(String, primary_key=True, default=lambda: gen_id("doc"))
    asset_id = Column(String, ForeignKey("assets.id"), nullable=False)
    doc_key = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    raw_text = Column(Text, default="")
    extracted_fields = Column(JSON, default=list)
    file_path = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="documents")


class AccountDocument(Base):
    __tablename__ = "account_documents"

    id = Column(String, primary_key=True, default=lambda: gen_id("doc"))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    doc_key = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    raw_text = Column(Text, default="")
    extracted_fields = Column(JSON, default=list)
    file_path = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="account_documents")
