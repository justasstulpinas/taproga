from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.models.user import Locale
from app.schemas.common import NormalizedEmail
from app.schemas.users import MeOut
from app.security.passwords import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH

NewPassword = Annotated[str, Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)]
# Existing passwords are only length-capped: rules may tighten after an account was created.
ExistingPassword = Annotated[str, Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)]
EmailToken = Annotated[str, Field(min_length=16, max_length=128)]
TurnstileToken = Annotated[str | None, Field(default=None, max_length=2048)]
BusinessName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
]


class RegisterIn(BaseModel):
    """Only these fields are read; anything else in the body (e.g. `is_superadmin`) is dropped."""

    email: NormalizedEmail
    password: NewPassword
    account_type: Literal["newlywed", "service"]
    locale: Locale = Locale.LT
    business_name: BusinessName | None = None
    turnstile_token: TurnstileToken

    @model_validator(mode="after")
    def _service_needs_business_name(self) -> Self:
        if self.account_type == "service" and not self.business_name:
            raise ValueError("business_name is required for service accounts")
        return self


class LoginIn(BaseModel):
    email: NormalizedEmail
    password: ExistingPassword


class LoginOut(BaseModel):
    mfa_required: bool
    user: MeOut


class TokenIn(BaseModel):
    token: EmailToken


class EmailIn(BaseModel):
    email: NormalizedEmail


class ForgotPasswordIn(BaseModel):
    email: NormalizedEmail
    turnstile_token: TurnstileToken


class ResetPasswordIn(BaseModel):
    token: EmailToken
    new_password: NewPassword


class ChangePasswordIn(BaseModel):
    current_password: ExistingPassword
    new_password: NewPassword


class MfaIn(BaseModel):
    code: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]


class AcceptedOut(BaseModel):
    """Deliberately uninformative: the same body whether or not the email has an account."""

    status: Literal["accepted"] = "accepted"
