import io

from PIL import Image, ImageOps

MAX_EDGE = 2000
JPEG_QUALITY = 85


def preprocess_bill_image(raw_bytes: bytes) -> bytes:
    """Auto-rotate per EXIF orientation, downscale to a 2000px longest edge, re-encode as JPEG q85."""
    image = Image.open(io.BytesIO(raw_bytes))
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    width, height = image.size
    longest = max(width, height)
    if longest > MAX_EDGE:
        scale = MAX_EDGE / longest
        image = image.resize((round(width * scale), round(height * scale)), Image.LANCZOS)

    out = io.BytesIO()
    image.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()
