import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum

from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.domain_errors import RateLimited
from app.repositories.throttle import ThrottleRepository
from app.security.tokens import SubjectHasher


class SubjectKind(StrEnum):
    IP = "ip"
    EMAIL = "email"
    CONTACT = "contact"


@dataclass(frozen=True)
class ThrottleRule:
    """After `limit` counted events inside `window`, each further event doubles the lockout."""

    action: str
    subject_kind: SubjectKind
    limit: int
    window: timedelta
    base_lockout: timedelta
    max_lockout: timedelta

    def lockout_for(self, count: int) -> timedelta:
        if count < self.limit:
            return timedelta(0)
        # Capped exponent: an unbounded count would overflow timedelta long before max_lockout.
        doublings = min(count - self.limit, MAX_DOUBLINGS)
        return min(self.base_lockout * int(2**doublings), self.max_lockout)


MAX_DOUBLINGS = 20
MINUTE = timedelta(minutes=1)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)


class Rules:
    LOGIN_IP = ThrottleRule("login_ip", SubjectKind.IP, 30, HOUR, MINUTE, HOUR)
    # Counts failures only and is cleared on success, so a user who eventually remembers their
    # password isn't punished later. Keyed by email hash, so unknown emails behave identically.
    LOGIN_FAILURE_ACCOUNT = ThrottleRule("login_fail_acct", SubjectKind.EMAIL, 5, DAY, MINUTE, HOUR)
    REGISTER_IP = ThrottleRule("register_ip", SubjectKind.IP, 5, HOUR, 5 * MINUTE, DAY)
    RESEND_VERIFICATION_IP = ThrottleRule("resend_ip", SubjectKind.IP, 10, HOUR, 5 * MINUTE, DAY)
    RESEND_VERIFICATION_ACCOUNT = ThrottleRule(
        "resend_acct", SubjectKind.EMAIL, 3, HOUR, 10 * MINUTE, DAY
    )
    PASSWORD_FORGOT_IP = ThrottleRule("forgot_ip", SubjectKind.IP, 10, HOUR, 5 * MINUTE, DAY)
    PASSWORD_FORGOT_ACCOUNT = ThrottleRule(
        "forgot_acct", SubjectKind.EMAIL, 3, HOUR, 10 * MINUTE, DAY
    )
    # Stops repeated sign-ups against an existing email from spamming its owner.
    ACCOUNT_EXISTS_NOTICE = ThrottleRule("exists_notice", SubjectKind.EMAIL, 2, DAY, HOUR, DAY)
    TOKEN_REDEEM_IP = ThrottleRule("token_redeem_ip", SubjectKind.IP, 20, HOUR, MINUTE, HOUR)
    VAISES_AVAILABILITY_IP = ThrottleRule("vaises_avail_ip", SubjectKind.IP, 60, HOUR, MINUTE, HOUR)
    VAISES_SUBMIT_IP = ThrottleRule("vaises_submit_ip", SubjectKind.IP, 5, HOUR, 5 * MINUTE, DAY)
    # Counts every attempt, failed ones included, so bots can't hammer Turnstile for free.
    VAISES_SUBMIT_ATTEMPT_IP = ThrottleRule(
        "vaises_submit_attempt_ip", SubjectKind.IP, 30, HOUR, 5 * MINUTE, DAY
    )
    # Keyed by the normalised contact, so one inbox or phone can't be flooded with receipts.
    VAISES_SUBMIT_RECIPIENT = ThrottleRule(
        "vaises_submit_recipient", SubjectKind.CONTACT, 3, DAY, HOUR, DAY
    )

    ACCOUNT_LOCKOUTS = (LOGIN_FAILURE_ACCOUNT,)


class Throttle:
    """Rate limiting backed by Postgres.

    Commits its own writes immediately: an attempt must be counted even when the request that
    made it fails, which is exactly when the surrounding transaction won't commit.
    """

    def __init__(self, session: AsyncSession, hasher: SubjectHasher) -> None:
        self._session = session
        self._repository = ThrottleRepository(session)
        self._hasher = hasher

    def _subject(self, rule: ThrottleRule, key: str) -> str:
        return self._hasher.hash(rule.subject_kind, key)

    async def check(self, rule: ThrottleRule, key: str) -> None:
        now = utcnow()
        stats = await self._repository.stats(
            rule.action, self._subject(rule, key), now - rule.window
        )
        if stats.last_at is None:
            return
        unlocks_at = stats.last_at + rule.lockout_for(stats.count)
        if unlocks_at > now:
            raise RateLimited(retry_after_seconds=math.ceil((unlocks_at - now).total_seconds()))

    async def record(self, rule: ThrottleRule, key: str) -> None:
        self._repository.record(rule.action, self._subject(rule, key), utcnow())
        await self._session.commit()

    async def hit(self, rule: ThrottleRule, key: str) -> None:
        """Check, then count this attempt. Rejected attempts are not counted, so an attacker
        can't extend a legitimate user's lockout indefinitely."""
        await self.check(rule, key)
        await self.record(rule, key)

    async def reset(self, rules: Sequence[ThrottleRule], key: str) -> None:
        for kind in {rule.subject_kind for rule in rules}:
            actions = [rule.action for rule in rules if rule.subject_kind == kind]
            await self._repository.clear(actions, self._hasher.hash(kind, key))
