"""Bootstrap script: creates an initial admin user from ADMIN_EMAIL /
ADMIN_PASSWORD / ADMIN_NAME env vars if one does not already exist.

Run with: python -m app.seed
"""
import asyncio

from sqlalchemy import select

from app.core.config import INSECURE_ADMIN_PASSWORD, get_settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.admin import AdminRole, AdminUser
from app.models.rbac import Role

settings = get_settings()


async def seed_admin() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AdminUser).where(AdminUser.email == settings.admin_email))
        existing = result.scalar_one_or_none()
        if existing is not None:
            print(f"Admin user already exists: {settings.admin_email}")
            return

        if settings.admin_password == INSECURE_ADMIN_PASSWORD and not settings.is_dev_env:
            raise SystemExit(
                "Refusing to create the bootstrap admin with the default password. "
                "Set ADMIN_PASSWORD (and ADMIN_EMAIL) before seeding."
            )

        role_result = await db.execute(select(Role).where(Role.name == settings.admin_role))
        role = role_result.scalar_one_or_none()

        admin = AdminUser(
            email=settings.admin_email,
            password_hash=hash_password(settings.admin_password),
            name=settings.admin_name,
            role=AdminRole(settings.admin_role),
            role_id=role.id if role is not None else None,
        )
        db.add(admin)
        await db.commit()
        print(f"Created admin user: {settings.admin_email} ({admin.role.value})")


if __name__ == "__main__":
    asyncio.run(seed_admin())
