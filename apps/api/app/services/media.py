import io
from uuid import UUID

import cloudinary
import cloudinary.uploader
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import AppError
from app.models import MediaRecord

MAX_BYTES = 5 * 1024 * 1024
ALLOWED_FORMATS = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}

_configured = False


def _configure(settings: Settings) -> None:
    global _configured
    if _configured:
        return
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key.get_secret_value(),
        api_secret=settings.cloudinary_api_secret.get_secret_value(),
        secure=True,
    )
    _configured = True


def _validate_image(content: bytes) -> tuple[str, int, int]:
    if not content or len(content) > MAX_BYTES:
        raise AppError('MEDIA_INVALID')
    try:
        with Image.open(io.BytesIO(content)) as img:
            img.verify()
        with Image.open(io.BytesIO(content)) as img:
            fmt = img.format
            width, height = img.size
    except Exception as exc:
        raise AppError('MEDIA_INVALID') from exc
    if fmt not in ALLOWED_FORMATS:
        raise AppError('MEDIA_INVALID')
    if width <= 0 or height <= 0:
        raise AppError('MEDIA_INVALID')
    return ALLOWED_FORMATS[fmt], width, height


async def upload_media(db: AsyncSession, settings: Settings, *, content: bytes, credit: str, source_url: str, license_: str) -> MediaRecord:
    fmt, width, height = _validate_image(content)
    _configure(settings)
    try:
        result = cloudinary.uploader.upload(content, folder=settings.cloudinary_folder, resource_type='image', overwrite=False, unique_filename=True)
    except Exception as exc:
        raise AppError('MEDIA_PROVIDER_ERROR') from exc
    row = MediaRecord(
        public_id=result['public_id'],
        asset_id=result['asset_id'],
        data={
            'url': result['secure_url'],
            'width': result.get('width', width),
            'height': result.get('height', height),
            'format': fmt,
            'credit': credit,
            'sourceUrl': source_url,
            'license': license_,
        },
    )
    db.add(row)
    await db.flush()
    return row


async def list_media(db: AsyncSession) -> list[MediaRecord]:
    return (await db.execute(select(MediaRecord).order_by(MediaRecord.created_at.desc()))).scalars().all()


async def get_media(db: AsyncSession, media_id: UUID) -> MediaRecord:
    row = (await db.execute(select(MediaRecord).where(MediaRecord.id == media_id))).scalar_one_or_none()
    if row is None:
        raise AppError('NOT_FOUND')
    return row


async def delete_media(db: AsyncSession, media_id: UUID) -> None:
    row = await get_media(db, media_id)
    await db.delete(row)
    await db.flush()
