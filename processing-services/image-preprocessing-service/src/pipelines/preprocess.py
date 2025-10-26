import cv2
import numpy as np


def preprocess_image(image_bytes: bytes) -> bytes:
    np_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
    if image is None:
        return image_bytes

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharpened = cv2.filter2D(blurred, -1, sharpen_kernel)

    success, encoded = cv2.imencode(".png", sharpened)
    if not success:
        return image_bytes
    return encoded.tobytes()
