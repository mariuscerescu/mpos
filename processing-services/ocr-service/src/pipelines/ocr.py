from __future__ import annotations

from functools import lru_cache
from typing import Any

from PIL import Image
import io
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

from ..core.config import get_settings

settings = get_settings()


@lru_cache(maxsize=1)
def get_model() -> tuple[TrOCRProcessor, VisionEncoderDecoderModel]:
    processor = TrOCRProcessor.from_pretrained(settings.model_name)
    model = VisionEncoderDecoderModel.from_pretrained(settings.model_name)
    return processor, model


def run_ocr(image_bytes: bytes) -> str:
    processor, model = get_model()
    # Asigurăm că imaginea este în format RGB (3 canale)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    pixel_values = processor(images=image, return_tensors="pt").pixel_values
    generated_ids = model.generate(pixel_values)
    text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
    return text.strip()
