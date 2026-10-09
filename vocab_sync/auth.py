"""Token decoding; does not persist credentials."""
import base64
import json
import time
from .errors import SyncError

def user_id_from_token(token):
    try:
        part = token.split(".")[1]
        payload = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        user_id = str(payload["sub"])
        if not user_id.isdigit():
            raise ValueError()
        if "exp" in payload and float(payload["exp"]) <= time.time():
            raise SyncError("登入權杖已過期，請重新登入 Duolingo 後取得新的 jwt_token。")
        return user_id
    except (ValueError, KeyError, IndexError, TypeError):
        raise SyncError("權杖格式不正確。請只輸入 jwt_token 的值，不包含 Cookie 名稱或引號。") from None

