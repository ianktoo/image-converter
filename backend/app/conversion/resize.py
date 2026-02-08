"""Resize image with crop, fill (color), or fill (blur)."""
import logging
from typing import Optional, Tuple

from PIL import Image, ImageFilter

logger = logging.getLogger("converter.resize")

FillMode = str  # "crop" | "color" | "blur"


def resize_to_fit(
    img: Image.Image,
    target_width: int,
    target_height: int,
    fill_mode: FillMode = "crop",
    fill_color: Optional[Tuple[int, int, int]] = None,
) -> Image.Image:
    """
    Produce an image of exactly (target_width, target_height).
    - crop: center-crop source to fill target (may lose edges).
    - color: scale to fit inside target, fill remainder with fill_color (default gray).
    - blur: scale to cover target, blur extended areas to fill.
    """
    if fill_color is None:
        fill_color = (128, 128, 128)
    w, h = img.size
    if img.mode != "RGB":
        img = img.convert("RGB")
    tw, th = target_width, target_height
    if w == tw and h == th:
        return img.copy()

    scale_cover = max(tw / w, th / h)  # scale so image covers target
    scale_fit = min(tw / w, th / h)   # scale so image fits inside target

    if fill_mode == "crop":
        scale = scale_cover
        new_w, new_h = int(w * scale), int(h * scale)
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        left = (new_w - tw) // 2
        top = (new_h - th) // 2
        return resized.crop((left, top, left + tw, top + th))

    if fill_mode == "color":
        scale = scale_fit
        new_w, new_h = int(w * scale), int(h * scale)
        if new_w <= 0 or new_h <= 0:
            out = Image.new("RGB", (tw, th), fill_color)
            return out
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        out = Image.new("RGB", (tw, th), fill_color)
        paste_x = (tw - new_w) // 2
        paste_y = (th - new_h) // 2
        out.paste(resized, (paste_x, paste_y))
        return out

    if fill_mode == "blur":
        scale = scale_cover
        new_w, new_h = int(w * scale), int(h * scale)
        if new_w <= 0 or new_h <= 0:
            out = Image.new("RGB", (tw, th), fill_color)
            return out
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        blurred = resized.filter(ImageFilter.GaussianBlur(radius=min(tw, th) // 20))
        left = (new_w - tw) // 2
        top = (new_h - th) // 2
        return blurred.crop((left, top, left + tw, top + th))

    logger.warning("Unknown fill_mode %s, using crop", fill_mode)
    return resize_to_fit(img, tw, th, "crop", fill_color)


def resize_keep_aspect(
    img: Image.Image,
    target_width: Optional[int] = None,
    target_height: Optional[int] = None,
) -> Image.Image:
    """
    Scale image to fit within target width and/or height, maintaining aspect ratio.
    If only one dimension is set, the other is computed from the image ratio.
    """
    w, h = img.size
    if img.mode != "RGB":
        img = img.convert("RGB")
    if target_width is None and target_height is None:
        return img.copy()
    if target_width is not None and target_height is not None:
        scale = min(target_width / w, target_height / h)
    elif target_width is not None:
        scale = target_width / w
    else:
        scale = target_height / h
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Parse #RRGGBB to (r,g,b). Default gray if invalid."""
    hex_color = hex_color.strip().lstrip("#")
    if len(hex_color) == 6:
        try:
            return (int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16))
        except ValueError:
            pass
    return (128, 128, 128)
