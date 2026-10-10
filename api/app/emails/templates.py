from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from html import escape

from app.integrations.email_senders import EmailMessage
from app.models.user import Locale


class EmailTemplate(StrEnum):
    VERIFY_EMAIL = "verify_email"
    ACCOUNT_EXISTS = "account_exists"
    PASSWORD_RESET = "password_reset"
    PASSWORD_CHANGED = "password_changed"


@dataclass(frozen=True)
class _Copy:
    subject: str
    heading: str
    body: str
    button: str
    footnote: str
    secondary_label: str | None = None


# Payload keys each template needs; the link values are absolute URLs built by the service.
_BUTTON_LINK_KEY = {
    EmailTemplate.VERIFY_EMAIL: "verify_url",
    EmailTemplate.ACCOUNT_EXISTS: "login_url",
    EmailTemplate.PASSWORD_RESET: "reset_url",
    EmailTemplate.PASSWORD_CHANGED: "forgot_url",
}
_SECONDARY_LINK_KEY = {EmailTemplate.ACCOUNT_EXISTS: "forgot_url"}

_COPY: Mapping[EmailTemplate, Mapping[Locale, _Copy]] = {
    EmailTemplate.VERIFY_EMAIL: {
        Locale.LT: _Copy(
            subject="Patvirtinkite el. pašto adresą",
            heading="Sveiki atvykę į Ta Proga",
            body="Liko vienas žingsnis – patvirtinkite savo el. pašto adresą.",
            button="Patvirtinti el. paštą",
            footnote="Nuoroda galioja 30 minučių. Jei paskyros nekūrėte, šį laišką ignoruokite.",
        ),
        Locale.EN: _Copy(
            subject="Confirm your email address",
            heading="Welcome to Ta Proga",
            body="One step left: confirm your email address.",
            button="Confirm email",
            footnote=(
                "This link is valid for 30 minutes. If you didn't create an account, "
                "you can ignore this email."
            ),
        ),
    },
    EmailTemplate.ACCOUNT_EXISTS: {
        Locale.LT: _Copy(
            subject="Bandymas registruotis jūsų el. paštu",
            heading="Jūs jau turite paskyrą",
            body=(
                "Kažkas bandė sukurti Ta Proga paskyrą šiuo el. pašto adresu, tačiau paskyra "
                "jau egzistuoja. Jei tai buvote jūs, tiesiog prisijunkite."
            ),
            button="Prisijungti",
            secondary_label="Pamiršote slaptažodį?",
            footnote="Jei tai buvote ne jūs, nieko daryti nereikia.",
        ),
        Locale.EN: _Copy(
            subject="Sign-up attempt with your email",
            heading="You already have an account",
            body=(
                "Someone tried to create a Ta Proga account with this email address, but an "
                "account already exists. If that was you, just log in."
            ),
            button="Log in",
            secondary_label="Forgot your password?",
            footnote="If this wasn't you, no action is needed.",
        ),
    },
    EmailTemplate.PASSWORD_RESET: {
        Locale.LT: _Copy(
            subject="Slaptažodžio atkūrimas",
            heading="Nustatykite naują slaptažodį",
            body="Gavome prašymą atkurti jūsų Ta Proga paskyros slaptažodį.",
            button="Nustatyti naują slaptažodį",
            footnote=(
                "Nuoroda galioja 30 minučių ir veikia vieną kartą. Jei prašymo neteikėte, "
                "šį laišką ignoruokite – slaptažodis nepasikeis."
            ),
        ),
        Locale.EN: _Copy(
            subject="Reset your password",
            heading="Set a new password",
            body="We received a request to reset the password for your Ta Proga account.",
            button="Set new password",
            footnote=(
                "This link is valid for 30 minutes and works once. If you didn't ask for this, "
                "ignore this email and your password stays the same."
            ),
        ),
    },
    EmailTemplate.PASSWORD_CHANGED: {
        Locale.LT: _Copy(
            subject="Jūsų slaptažodis pakeistas",
            heading="Slaptažodis pakeistas",
            body=(
                "Jūsų Ta Proga paskyros slaptažodis ką tik buvo pakeistas, o kiti prisijungimai "
                "atjungti."
            ),
            button="Tai buvau ne aš – atkurti slaptažodį",
            footnote="Jei slaptažodį keitėte jūs, nieko daryti nereikia.",
        ),
        Locale.EN: _Copy(
            subject="Your password was changed",
            heading="Password changed",
            body=(
                "The password for your Ta Proga account was just changed and all other sessions "
                "were signed out."
            ),
            button="This wasn't me — reset password",
            footnote="If you made this change, no action is needed.",
        ),
    },
}


def _render_html(copy: _Copy, button_url: str, secondary_url: str | None) -> str:
    secondary = (
        f'<p style="margin:16px 0 0"><a href="{escape(secondary_url)}" '
        f'style="color:#6b5e55">{escape(copy.secondary_label)}</a></p>'
        if secondary_url and copy.secondary_label
        else ""
    )
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f3ef">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ef">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
 style="max-width:480px;background:#ffffff;border-radius:12px;font-family:Georgia,serif;color:#2b2320">
<tr><td style="padding:40px 32px">
<p style="margin:0 0 24px;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#6b5e55">Ta Proga</p>
<h1 style="margin:0 0 16px;font-size:24px;font-weight:normal">{escape(copy.heading)}</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.6;font-family:Helvetica,Arial,sans-serif">{escape(copy.body)}</p>
<a href="{escape(button_url)}" style="display:inline-block;padding:14px 24px;background:#2b2320;color:#ffffff;
 text-decoration:none;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:15px">{escape(copy.button)}</a>
{secondary}
<p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#6b5e55;font-family:Helvetica,Arial,sans-serif">{escape(copy.footnote)}</p>
</td></tr></table></td></tr></table></body></html>"""  # noqa: E501


def _render_text(copy: _Copy, button_url: str, secondary_url: str | None) -> str:
    lines = [copy.heading, "", copy.body, "", f"{copy.button}: {button_url}"]
    if secondary_url and copy.secondary_label:
        lines.append(f"{copy.secondary_label} {secondary_url}")
    lines += ["", copy.footnote, "", "— Ta Proga"]
    return "\n".join(lines)


def render_email(
    template: EmailTemplate, locale: Locale, to: str, payload: Mapping[str, str]
) -> EmailMessage:
    copy = _COPY[template][locale]
    button_url = payload[_BUTTON_LINK_KEY[template]]
    secondary_key = _SECONDARY_LINK_KEY.get(template)
    secondary_url = payload[secondary_key] if secondary_key else None
    return EmailMessage(
        to=to,
        subject=copy.subject,
        text=_render_text(copy, button_url, secondary_url),
        html=_render_html(copy, button_url, secondary_url),
    )
