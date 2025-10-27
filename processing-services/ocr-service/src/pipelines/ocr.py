from __future__ import annotations

import io
from PIL import Image
import pytesseract
import cv2
import numpy as np

from ..core.config import get_settings

settings = get_settings()


def run_ocr(image_bytes: bytes) -> str:
    """
    Extrage text din imagine folosind Tesseract OCR.
    Tesseract este optimizat pentru limba engleză și oferă rezultate excelente
    pentru text tipărit.
    """
    # Convertim bytes la numpy array pentru OpenCV
    np_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_array, cv2.IMREAD_GRAYSCALE)
    
    if image is None:
        # Fallback la PIL dacă OpenCV eșuează
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "L":
            image = image.convert("L")
    else:
        # Convertim numpy array la PIL Image pentru pytesseract
        image = Image.fromarray(image)
    
    # Configurare Tesseract pentru limba engleză
    # --psm 6: Assume a single uniform block of text
    # --oem 3: Default, based on what is available (LSTM + Legacy)
    custom_config = r'--oem 3 --psm 6'
    
    # Extrage textul
    text = pytesseract.image_to_string(image, lang='eng', config=custom_config)
    
    return text.strip()
