from datetime import timedelta

from app.services.throttle import HOUR, MINUTE, Rules, SubjectKind, ThrottleRule

RULE = ThrottleRule(
    "test", SubjectKind.IP, limit=3, window=HOUR, base_lockout=MINUTE, max_lockout=10 * MINUTE
)


def test_no_lockout_below_limit() -> None:
    assert RULE.lockout_for(0) == timedelta(0)
    assert RULE.lockout_for(2) == timedelta(0)


def test_lockout_doubles_past_the_limit() -> None:
    assert RULE.lockout_for(3) == MINUTE
    assert RULE.lockout_for(4) == 2 * MINUTE
    assert RULE.lockout_for(5) == 4 * MINUTE


def test_lockout_is_capped() -> None:
    assert RULE.lockout_for(50) == 10 * MINUTE


def test_rule_actions_are_unique() -> None:
    rules = [value for value in vars(Rules).values() if isinstance(value, ThrottleRule)]

    assert len({rule.action for rule in rules}) == len(rules)
