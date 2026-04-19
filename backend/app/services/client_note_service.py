"""Заметки клиента: CRUD + pin (RBAC)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenScopeError, NotFoundError
from app.models.client import ClientNote
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.client_note import ClientNoteOut
from app.services import client_service


def _author_display(author: User | None) -> str | None:
    if author is None:
        return None
    parts = [author.first_name or "", author.last_name or ""]
    s = " ".join(p for p in parts if p).strip()
    if s:
        return s
    return author.email


async def list_notes(db: AsyncSession, user: User, client_id: UUID) -> list[ClientNoteOut]:
    await client_service.get_client(db, user, client_id)

    stmt = select(ClientNote).where(ClientNote.client_id == client_id)
    if user.role == UserRole.master:
        stmt = stmt.where(ClientNote.author_user_id == user.id)
    stmt = stmt.order_by(ClientNote.pinned.desc(), ClientNote.created_at.desc())
    notes = list((await db.execute(stmt)).scalars().all())
    user_ids = {n.author_user_id for n in notes if n.author_user_id}
    users: dict[UUID, User] = {}
    if user_ids:
        urows = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        users = {u.id: u for u in urows}
    return [
        ClientNoteOut(
            id=n.id,
            client_id=n.client_id,
            author_user_id=n.author_user_id,
            author_display_name=_author_display(users.get(n.author_user_id))
            if n.author_user_id
            else None,
            content=n.content,
            pinned=n.pinned,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in notes
    ]


async def create_note(db: AsyncSession, user: User, client_id: UUID, content: str) -> ClientNoteOut:
    await client_service.get_client(db, user, client_id)

    if user.role == UserRole.master:
        if user.master_id is None:
            raise ForbiddenScopeError("Master is not linked")
    elif user.role not in (
        UserRole.owner,
        UserRole.admin,
        UserRole.reception,
        UserRole.master,
    ):
        raise ForbiddenScopeError("Cannot create note")

    note = ClientNote(
        client_id=client_id,
        author_user_id=user.id,
        content=content,
        pinned=False,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    author = await db.get(User, user.id)
    return ClientNoteOut(
        id=note.id,
        client_id=note.client_id,
        author_user_id=note.author_user_id,
        author_display_name=_author_display(author),
        content=note.content,
        pinned=note.pinned,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _can_edit_note(user: User, note: ClientNote) -> bool:
    if user.role in (UserRole.owner, UserRole.admin, UserRole.reception):
        return True
    if note.author_user_id is not None and note.author_user_id == user.id:
        return True
    return False


async def update_note(
    db: AsyncSession, user: User, client_id: UUID, note_id: UUID, content: str
) -> ClientNoteOut:
    await client_service.get_client(db, user, client_id)
    note = await db.get(ClientNote, note_id)
    if note is None or note.client_id != client_id:
        raise NotFoundError("Note not found")
    if not _can_edit_note(user, note):
        raise ForbiddenScopeError("Cannot edit this note")
    note.content = content
    await db.flush()
    await db.refresh(note)
    author = await db.get(User, note.author_user_id) if note.author_user_id else None
    return ClientNoteOut(
        id=note.id,
        client_id=note.client_id,
        author_user_id=note.author_user_id,
        author_display_name=_author_display(author),
        content=note.content,
        pinned=note.pinned,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


async def delete_note(db: AsyncSession, user: User, client_id: UUID, note_id: UUID) -> None:
    await client_service.get_client(db, user, client_id)
    note = await db.get(ClientNote, note_id)
    if note is None or note.client_id != client_id:
        raise NotFoundError("Note not found")
    if not _can_edit_note(user, note):
        raise ForbiddenScopeError("Cannot delete this note")
    await db.delete(note)
    await db.flush()


async def set_pinned(
    db: AsyncSession, user: User, client_id: UUID, note_id: UUID, pinned: bool
) -> ClientNoteOut:
    if user.role not in (UserRole.owner, UserRole.admin, UserRole.reception):
        raise ForbiddenScopeError("Cannot pin notes")
    await client_service.get_client(db, user, client_id)
    note = await db.get(ClientNote, note_id)
    if note is None or note.client_id != client_id:
        raise NotFoundError("Note not found")
    note.pinned = pinned
    await db.flush()
    await db.refresh(note)
    author = await db.get(User, note.author_user_id) if note.author_user_id else None
    return ClientNoteOut(
        id=note.id,
        client_id=note.client_id,
        author_user_id=note.author_user_id,
        author_display_name=_author_display(author),
        content=note.content,
        pinned=note.pinned,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )
