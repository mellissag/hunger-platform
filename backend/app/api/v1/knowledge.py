"""CRUD базы знаний (kb_document) + фоновая индексация."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.deps import get_db, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.knowledge import KBDocumentCreate, KBDocumentOut, KBDocumentUpdate
from app.services import knowledge_admin

router = APIRouter(prefix="/kb", tags=["knowledge"])

_KB_ROLES = (UserRole.owner, UserRole.admin)


@router.get("/documents", response_model=PaginatedResponse[KBDocumentOut])
async def list_kb_documents(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_KB_ROLES))],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[KBDocumentOut]:
    rows, total = await knowledge_admin.list_documents(db, page=page, page_size=page_size)
    items = [KBDocumentOut.model_validate(r) for r in rows]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/documents/{doc_id}", response_model=KBDocumentOut)
async def get_kb_document(
    doc_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_KB_ROLES))],
) -> KBDocumentOut:
    doc = await knowledge_admin.get_document(db, doc_id)
    if doc is None:
        raise NotFoundError("Document not found")
    return KBDocumentOut.model_validate(doc)


@router.post("/documents", response_model=KBDocumentOut)
async def create_kb_document(
    body: KBDocumentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_KB_ROLES))],
) -> KBDocumentOut:
    doc = await knowledge_admin.create_document(
        db,
        title=body.title,
        source_type=body.source_type,
        source_ref=body.source_ref,
        content=body.content,
        lang=body.lang,
    )
    return KBDocumentOut.model_validate(doc)


@router.patch("/documents/{doc_id}", response_model=KBDocumentOut)
async def update_kb_document(
    doc_id: UUID,
    body: KBDocumentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_KB_ROLES))],
) -> KBDocumentOut:
    doc = await knowledge_admin.get_document(db, doc_id)
    if doc is None:
        raise NotFoundError("Document not found")
    patch = body.model_dump(exclude_unset=True)
    doc = await knowledge_admin.update_document(db, doc, patch)
    return KBDocumentOut.model_validate(doc)


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_kb_document(
    doc_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_roles(*_KB_ROLES))],
) -> None:
    doc = await knowledge_admin.get_document(db, doc_id)
    if doc is None:
        raise NotFoundError("Document not found")
    await knowledge_admin.delete_document(db, doc)
