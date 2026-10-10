import pytest

from app.emails.templates import EmailTemplate, render_email
from app.models.user import Locale

DATE_LABEL = "2026 m. lapkričio 14 d."
OWNER_PAYLOAD = {
    "kind_label": "Datos užklausa",
    "date_label": DATE_LABEL,
    "availability_label": "laisva",
    "contact": "jonas@pavyzdys.lt",
    "admin_url": "http://localhost:3000/admin/vaises/uzklausos?id=abc",
}


def test_owner_notification_lt() -> None:
    m = render_email(
        EmailTemplate.VAISES_OWNER_NOTIFICATION, Locale.LT, "owner@vaises.lt", OWNER_PAYLOAD
    )
    assert m.subject == f"Nauja užklausa: {DATE_LABEL}"
    assert "jonas@pavyzdys.lt" in m.text
    assert DATE_LABEL in m.text
    assert "laisva" in m.text
    assert "/admin/vaises/uzklausos?id=abc" in m.html
    assert "Atidaryti užklausą" in m.html


def test_owner_notification_consultation_omits_empty_lines() -> None:
    payload = {
        **OWNER_PAYLOAD,
        "kind_label": "Konsultacija",
        "date_label": "",
        "availability_label": "",
    }
    m = render_email(EmailTemplate.VAISES_OWNER_NOTIFICATION, Locale.LT, "owner@vaises.lt", payload)
    assert m.subject == "Nauja konsultacijos užklausa"
    assert "Konsultacija" in m.text
    assert "Data:" not in m.text
    assert "Užimtumas" not in m.text
    assert "Data:" not in m.html


def test_receipt_has_no_links() -> None:
    m = render_email(
        EmailTemplate.VAISES_RECEIPT_DATE,
        Locale.LT,
        "jonas@pavyzdys.lt",
        {"date_label": DATE_LABEL},
    )
    assert f"Gavome jūsų užklausą dėl {DATE_LABEL}." in m.text
    assert "<a " not in m.html
    assert "http" not in m.text
    assert "http" not in m.html


def test_consultation_receipt_copy_and_no_links() -> None:
    m = render_email(EmailTemplate.VAISES_RECEIPT_CONSULTATION, Locale.LT, "j@pavyzdys.lt", {})
    assert "Gavome jūsų užklausą. Susisieksime su jumis el. paštu." in m.text
    assert "<a " not in m.html
    assert "http" not in m.text


def test_contact_is_escaped_in_owner_html() -> None:
    payload = {**OWNER_PAYLOAD, "contact": "<script>x</script>@a.lt"}
    m = render_email(EmailTemplate.VAISES_OWNER_NOTIFICATION, Locale.LT, "owner@vaises.lt", payload)
    assert "<script>" not in m.html
    assert "&lt;script&gt;x&lt;/script&gt;@a.lt" in m.html
    assert "<script>x</script>@a.lt" in m.text


@pytest.mark.parametrize("locale", [Locale.LT, Locale.EN])
@pytest.mark.parametrize(
    "template",
    [
        EmailTemplate.VAISES_OWNER_NOTIFICATION,
        EmailTemplate.VAISES_RECEIPT_DATE,
        EmailTemplate.VAISES_RECEIPT_CONSULTATION,
    ],
)
def test_every_template_has_lt_and_en(template: EmailTemplate, locale: Locale) -> None:
    m = render_email(template, locale, "a@b.lt", OWNER_PAYLOAD)
    assert m.subject
    assert m.text
    assert m.html
