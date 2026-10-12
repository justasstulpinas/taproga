from collections.abc import Mapping
from dataclasses import dataclass, replace
from enum import StrEnum
from html import escape
from string import Formatter

from app.integrations.email_senders import EmailMessage
from app.models.user import Locale


class EmailTemplate(StrEnum):
    VERIFY_EMAIL = "verify_email"
    ACCOUNT_EXISTS = "account_exists"
    PASSWORD_RESET = "password_reset"
    PASSWORD_CHANGED = "password_changed"
    VAISES_OWNER_NOTIFICATION = "vaises_owner_notification"
    VAISES_RECEIPT_DATE = "vaises_receipt_date"
    VAISES_RECEIPT_CONSULTATION = "vaises_receipt_consultation"


# Sent to the visitor's contact, which is otherwise stored only encrypted.
VAISES_RECEIPTS = frozenset(
    {EmailTemplate.VAISES_RECEIPT_DATE, EmailTemplate.VAISES_RECEIPT_CONSULTATION}
)


@dataclass(frozen=True)
class _Copy:
    subject: str
    heading: str
    body: str
    button: str | None
    footnote: str
    secondary_label: str | None = None
    # Replaces `subject` when the payload's date_label is empty.
    subject_without_date: str | None = None


# Payload keys each template needs; the link values are absolute URLs built by the service.
_BUTTON_LINK_KEY = {
    EmailTemplate.VERIFY_EMAIL: "verify_url",
    EmailTemplate.ACCOUNT_EXISTS: "login_url",
    EmailTemplate.PASSWORD_RESET: "reset_url",
    EmailTemplate.PASSWORD_CHANGED: "forgot_url",
    EmailTemplate.VAISES_OWNER_NOTIFICATION: "admin_url",
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
    EmailTemplate.VAISES_OWNER_NOTIFICATION: {
        Locale.LT: _Copy(
            subject="Nauja užklausa · {service_label}: {date_label}",
            subject_without_date="Nauja konsultacijos užklausa",
            heading="Gauta nauja užklausa",
            body=(
                "Tipas: {kind_label}\n"
                "Paslauga: {service_label}\n"
                "Data: {date_label}\n"
                "Užimtumas pateikimo metu: {availability_label}\n"
                "Kontaktas: {contact}\n"
                "Žinutė: {message}"
            ),
            button="Atidaryti užklausą",
            footnote="Šis laiškas išsiųstas automatiškai.",
        ),
        Locale.EN: _Copy(
            subject="New inquiry · {service_label}: {date_label}",
            subject_without_date="New consultation inquiry",
            heading="New inquiry received",
            body=(
                "Type: {kind_label}\n"
                "Service: {service_label}\n"
                "Date: {date_label}\n"
                "Availability at submission: {availability_label}\n"
                "Contact: {contact}\n"
                "Message: {message}"
            ),
            button="Open inquiry",
            footnote="This email was sent automatically.",
        ),
    },
    EmailTemplate.VAISES_RECEIPT_DATE: {
        Locale.LT: _Copy(
            subject="Gavome jūsų užklausą",
            heading="Užklausa gauta",
            body="Gavome jūsų užklausą dėl {date_label}. Susisieksime su jumis el. paštu.",
            button=None,
            footnote="Šis laiškas išsiųstas automatiškai.",
        ),
        Locale.EN: _Copy(
            subject="We received your inquiry",
            heading="Inquiry received",
            body="We received your inquiry for {date_label}. We will contact you by email.",
            button=None,
            footnote="This email was sent automatically.",
        ),
    },
    EmailTemplate.VAISES_RECEIPT_CONSULTATION: {
        Locale.LT: _Copy(
            subject="Gavome jūsų užklausą",
            heading="Užklausa gauta",
            body="Gavome jūsų užklausą. Susisieksime su jumis el. paštu.",
            button=None,
            footnote="Šis laiškas išsiųstas automatiškai.",
        ),
        Locale.EN: _Copy(
            subject="We received your inquiry",
            heading="Inquiry received",
            body="We received your inquiry. We will contact you by email.",
            button=None,
            footnote="This email was sent automatically.",
        ),
    },
}


def _fill(template: str, values: Mapping[str, str]) -> str:
    """Fill {placeholders}; in a multi-line template, lines with an empty value are dropped."""
    lines = template.split("\n")
    kept = [
        line
        for line in lines
        if len(lines) == 1 or all(values[name] for _, name, _, _ in Formatter().parse(line) if name)
    ]
    return "\n".join(line.format_map(values) for line in kept)


def _render_html(copy: _Copy, button_url: str | None, secondary_url: str | None) -> str:
    button = (
        f'<a href="{escape(button_url)}" style="display:inline-block;padding:14px 24px;'
        "background:#2b2320;color:#ffffff;\n text-decoration:none;border-radius:8px;"
        'font-family:Helvetica,Arial,sans-serif;font-size:15px">'
        f"{escape(copy.button)}</a>"
        if button_url and copy.button
        else ""
    )
    body = escape(copy.body).replace("\n", "<br>")
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
<p style="margin:0 0 28px;font-size:16px;line-height:1.6;font-family:Helvetica,Arial,sans-serif">{body}</p>
{button}
{secondary}
<p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#6b5e55;font-family:Helvetica,Arial,sans-serif">{escape(copy.footnote)}</p>
</td></tr></table></td></tr></table></body></html>"""  # noqa: E501


def _render_text(copy: _Copy, button_url: str | None, secondary_url: str | None) -> str:
    lines = [copy.heading, "", copy.body, ""]
    if button_url and copy.button:
        lines.append(f"{copy.button}: {button_url}")
    if secondary_url and copy.secondary_label:
        lines.append(f"{copy.secondary_label} {secondary_url}")
    lines += ["", copy.footnote, "", "— Ta Proga"]
    return "\n".join(lines)


def render_email(
    template: EmailTemplate, locale: Locale, to: str, payload: Mapping[str, str]
) -> EmailMessage:
    template_copy = _COPY[template][locale]
    subject = (
        template_copy.subject_without_date
        if template_copy.subject_without_date and not payload.get("date_label")
        else _fill(template_copy.subject, payload)
    )
    copy = replace(template_copy, subject=subject, body=_fill(template_copy.body, payload))
    button_key = _BUTTON_LINK_KEY.get(template)
    button_url = payload[button_key] if button_key else None
    secondary_key = _SECONDARY_LINK_KEY.get(template)
    secondary_url = payload[secondary_key] if secondary_key else None
    return EmailMessage(
        to=to,
        subject=copy.subject,
        text=_render_text(copy, button_url, secondary_url),
        html=_render_html(copy, button_url, secondary_url),
    )
