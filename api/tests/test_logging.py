import json
import logging

from app.logging_config import REDACTED, JsonFormatter, redact
from app.request_context import request_id_var


def test_redact_masks_sensitive_keys_at_any_depth() -> None:
    data = {
        "user": {"Email": "ona@example.lt", "name": "Ona"},
        "headers": [{"authorization": "Bearer abc"}],
        "password": "hunter2hunter2",
    }

    assert redact(data) == {
        "user": {"Email": REDACTED, "name": "Ona"},
        "headers": [{"authorization": REDACTED}],
        "password": REDACTED,
    }


def test_json_formatter_includes_request_id_and_redacts_extras() -> None:
    token = request_id_var.set("req-12345678")
    try:
        record = logging.makeLogRecord(
            {
                "name": "app.test",
                "levelname": "INFO",
                "msg": "login_failed",
                "access_token": "secret-value",
                "attempt": 3,
            }
        )
        line = json.loads(JsonFormatter().format(record))
    finally:
        request_id_var.reset(token)

    assert line["message"] == "login_failed"
    assert line["request_id"] == "req-12345678"
    assert line["access_token"] == REDACTED
    assert line["attempt"] == 3


def test_json_formatter_keeps_lithuanian_characters_readable() -> None:
    record = logging.makeLogRecord({"msg": "Ąžuolas ir Šarūnė"})

    assert "Ąžuolas ir Šarūnė" in JsonFormatter().format(record)
