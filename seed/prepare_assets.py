"""Prepare only the five approved P0 images; never seed or publish database content."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import logging
import os
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid5

import cloudinary
import cloudinary.api
import cloudinary.exceptions
import cloudinary.uploader
import requests
from dotenv import dotenv_values
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IDENTITY = "jelajah-lokal-p0-v1"
NAMESPACE = UUID("f43a5220-0a9a-4c5d-a94d-7bec6878e78f")
LICENSE_URL = "https://www.pexels.com/license/"
MAX_BYTES = 5 * 1024 * 1024
SOURCES = (
    ("36810327", "Tom Fisk", "stunning-aerial-view-of-bali-s-terraced-rice-fields-36810327", 8192, 6144),
    ("37121687", "Noval Gani", "authentic-indonesian-street-food-satay-37121687", 5719, 3887),
    ("28881743", "TIORHISTA R", "traditional-village-houses-with-thatch-roofs-28881743", 6000, 4000),
    ("1846335", "Tom Fisk", "view-of-rice-fields-1846335", 5441, 3632),
    ("1547429", "Tom Fisk", "drone-footage-of-village-near-cropland-1547429", 3992, 2242),
)


class PreparationError(Exception):
    """A safe error whose text never contains provider responses or credentials."""


class FrameImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            src = dict(attrs).get("src", "")
            if urlparse(src).hostname == "images.pexels.com":
                self.urls.append(src)


def configure_credentials(env_file: Path) -> None:
    # The legacy spelling is accepted here only for the owner's private input.
    # Application runtime configuration exclusively uses CLOUDINARY_API_SECRET.
    private = dotenv_values(env_file, interpolate=False) if env_file.is_file() else {}
    keys = ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_APY_SECRET")
    values = {key: os.environ.get(key) or private.get(key) for key in keys}
    corrected, legacy = values["CLOUDINARY_API_SECRET"], values["CLOUDINARY_APY_SECRET"]
    if corrected and legacy and corrected != legacy:
        raise PreparationError("The private Cloudinary secret spellings conflict; resolve privately before upload.")
    secret = corrected or legacy
    if not values["CLOUDINARY_CLOUD_NAME"] or not values["CLOUDINARY_API_KEY"] or not secret:
        raise PreparationError("Cloudinary credentials are incomplete in the private environment.")
    cloudinary.config(cloud_name=values["CLOUDINARY_CLOUD_NAME"], api_key=values["CLOUDINARY_API_KEY"], api_secret=secret, secure=True)


def approved_urls() -> dict[str, str]:
    parser = FrameImages()
    parser.feed((ROOT / "docs/designs/xP9-xjjjSU.html").read_text(encoding="utf-8"))
    urls = {}
    for photo_id, *_ in SOURCES:
        matches = [url for url in parser.urls if urlparse(url).path == f"/photos/{photo_id}/pexels-photo-{photo_id}.jpeg"]
        if not matches:
            raise PreparationError(f"Approved frame image missing for photo {photo_id}.")
        urls[photo_id] = matches[0]
    return urls


def download_image(session: requests.Session, url: str, expected_host: str) -> tuple[bytes, str, int, int, str]:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != expected_host or parsed.username or parsed.password:
        raise PreparationError("Image URL is outside the approved HTTPS media host.")
    # Do not follow arbitrary redirects or send credentials to image delivery hosts.
    with session.get(url, timeout=(10, 30), stream=True, allow_redirects=False) as response:
        if response.status_code != 200:
            raise PreparationError(f"Image retrieval returned HTTP {response.status_code} from {expected_host}.")
        mime = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
        if mime not in {"image/jpeg", "image/png", "image/webp"}:
            raise PreparationError("Image retrieval did not return an allowed raster Content-Type.")
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > MAX_BYTES:
                raise PreparationError("Image exceeds the 5 MiB upload limit.")
            chunks.append(chunk)
        payload = b"".join(chunks)
    try:
        with Image.open(io.BytesIO(payload)) as image:
            width, height, fmt = image.width, image.height, image.format
            if fmt not in {"JPEG", "PNG", "WEBP"} or width < 1 or height < 1 or width * height > 40_000_000:
                raise PreparationError("Image signature or dimensions are invalid.")
            if Image.MIME[fmt] != mime:
                raise PreparationError("Image signature does not match its Content-Type.")
            image.verify()
        with Image.open(io.BytesIO(payload)) as image:
            image.load()
    except PreparationError:
        raise
    except Exception:
        raise PreparationError("Raster image could not be decoded.") from None
    return payload, mime, width, height, fmt.lower().replace("jpeg", "jpg")


def check_owned(resource: dict, public_id: str, photo_id: str) -> None:
    context = resource.get("context", {}).get("custom", {})
    expected = {"application": "jelajah-lokal", "seed_identity": IDENTITY, "source_photo_id": photo_id}
    if resource.get("public_id") != public_id or any(context.get(key) != value for key, value in expected.items()):
        raise PreparationError(f"Ownership conflict at seed public ID for photo {photo_id}; no changes made to that asset.")
    if resource.get("resource_type") != "image" or resource.get("type") != "upload":
        raise PreparationError(f"Unexpected Cloudinary resource type for photo {photo_id}.")


def prepare(env_file: Path) -> None:
    configure_credentials(env_file)
    urls = approved_urls()
    manifest_path = ROOT / "seed/assets-manifest.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
    if previous and (previous.get("schemaVersion") != 1 or previous.get("seedIdentity") != IDENTITY):
        raise PreparationError("Existing asset manifest has a different schema or seed owner.")
    previous_assets = {asset["publicId"]: asset for asset in previous.get("assets", [])}
    assets = []
    session = requests.Session()
    session.headers.update({"User-Agent": "JelajahLokalAssetPreparation/1.0", "Accept": "image/jpeg,image/png,image/webp"})
    try:
        for photo_id, photographer, slug, source_width, source_height in SOURCES:
            public_id = f"jelajah-lokal/seed/pexels-{photo_id}"
            payload, mime, width, height, fmt = download_image(session, urls[photo_id], "images.pexels.com")
            source_hash = hashlib.sha256(payload).hexdigest()
            source_url = f"https://www.pexels.com/photo/{slug}/"
            try:
                resource = cloudinary.api.resource(public_id, resource_type="image", type="upload", context=True, timeout=30)
                action = "reused"
            except cloudinary.exceptions.NotFound:
                cloudinary.uploader.upload(
                    io.BytesIO(payload), resource_type="image", type="upload", public_id=public_id,
                    overwrite=False, unique_filename=False, use_filename=False, timeout=30,
                    context={"application": "jelajah-lokal", "seed_identity": IDENTITY, "source_photo_id": photo_id,
                             "source_sha256": source_hash, "credit": f"{photographer} / Pexels", "source_url": source_url,
                             "license": "Pexels License"},
                )
                # A concurrent creator can win; re-read and require ownership before accepting.
                resource = cloudinary.api.resource(public_id, resource_type="image", type="upload", context=True, timeout=30)
                action = "uploaded"
            check_owned(resource, public_id, photo_id)
            old = previous_assets.get(public_id)
            if old and old["assetId"] != resource.get("asset_id"):
                raise PreparationError(f"Cloudinary asset identity changed for photo {photo_id}; review privately.")
            secure_url = resource.get("secure_url", "")
            if not resource.get("asset_id") or not secure_url:
                raise PreparationError(f"Cloudinary returned incomplete image metadata for photo {photo_id}.")
            delivered, delivery_mime, delivery_width, delivery_height, delivery_format = download_image(session, secure_url, "res.cloudinary.com")
            if (delivery_width, delivery_height, delivery_format) != (resource.get("width"), resource.get("height"), resource.get("format")):
                raise PreparationError(f"Cloudinary delivery dimensions/format mismatch for photo {photo_id}.")
            owned_hash = resource.get("context", {}).get("custom", {}).get("source_sha256")
            if not owned_hash or hashlib.sha256(delivered).hexdigest() != owned_hash:
                raise PreparationError(f"Cloudinary delivered bytes differ from owned upload for photo {photo_id}.")
            now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            assets.append({
                "documentId": str(uuid5(NAMESPACE, f"media:{photo_id}")), "seedIdentity": IDENTITY,
                "sourcePhotoId": photo_id, "url": secure_url, "secureUrl": secure_url,
                "publicId": public_id, "assetId": resource["asset_id"], "width": resource["width"], "height": resource["height"],
                "format": resource["format"], "bytes": resource.get("bytes"), "version": resource.get("version"),
                "createdAt": resource.get("created_at"), "sourceUrl": source_url, "downloadUrl": urls[photo_id],
                "credit": f"{photographer} / Pexels", "license": "Pexels License", "licenseUrl": LICENSE_URL,
                "sourceOriginalWidth": source_width, "sourceOriginalHeight": source_height,
                "ownership": {"application": "jelajah-lokal", "seedIdentity": IDENTITY, "sourcePhotoId": photo_id},
                "proof": {"checkedAt": now, "sourceHttpStatus": 200, "sourceContentType": mime,
                          "retrievedWidth": width, "retrievedHeight": height, "retrievedFormat": fmt,
                          "retrievedSha256": source_hash, "uploadedSha256": owned_hash,
                          "deliveryHttpStatus": 200, "deliveryContentType": delivery_mime,
                          "deliverySha256": hashlib.sha256(delivered).hexdigest(), "lastAction": action},
            })
            # Persist each successful owned image; a failed later upload can safely resume.
            manifest = {"schemaVersion": 1, "seedIdentity": IDENTITY, "preparedAt": now, "assets": assets}
            temporary = manifest_path.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporary.replace(manifest_path)
            print(json.dumps({"photoId": photo_id, "action": action, "publicId": public_id,
                              "assetId": resource["asset_id"], "width": resource["width"], "height": resource["height"],
                              "format": resource["format"], "deliveryHttpStatus": 200}))
    finally:
        session.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT.parent / ".env", help="Private credential input; never rewritten.")
    args = parser.parse_args()
    # Provider exception bodies/debug output are deliberately excluded from terminal logs.
    logging.getLogger("cloudinary").setLevel(logging.CRITICAL)
    try:
        prepare(args.env_file)
    except PreparationError as error:
        print(f"Asset preparation stopped: {error}")
        return 1
    except Exception as error:
        print(f"Asset preparation stopped: {type(error).__name__}; provider response suppressed to protect credentials.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
