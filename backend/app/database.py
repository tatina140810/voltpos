from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import Delete, Update, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, with_loader_criteria

from app.config import settings


class Base(DeclarativeBase):
    pass


TENANT_MODELS: Sequence[type[Base]] = []


class TenantSession:
    def __init__(self, session: AsyncSession):
        self.session = session

    @property
    def org_id(self) -> int | None:
        return self.session.info.get("org_id")

    async def execute(self, statement, *args, **kwargs):
        if self.org_id is not None and isinstance(statement, (Update, Delete)):
            table = statement.table
            if hasattr(table.c, "org_id"):
                statement = statement.where(table.c.org_id == self.org_id)
        return await self.session.execute(statement, *args, **kwargs)

    async def commit(self):
        return await self.session.commit()

    async def refresh(self, instance):
        return await self.session.refresh(instance)

    async def flush(self):
        return await self.session.flush()

    def add(self, instance):
        if hasattr(instance, "org_id") and getattr(instance, "org_id", None) is None and self.org_id is not None:
            instance.org_id = self.org_id
        return self.session.add(instance)


engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


@event.listens_for(AsyncSession.sync_session_class, "do_orm_execute")
def _add_tenant_filter(execute_state):
    org_id = execute_state.session.info.get("org_id")
    if org_id is None or not execute_state.is_select:
        return
    statement = execute_state.statement
    for model in TENANT_MODELS:
        statement = statement.options(
            with_loader_criteria(model, lambda cls: cls.org_id == org_id, include_aliases=True)
        )
    execute_state.statement = statement


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
