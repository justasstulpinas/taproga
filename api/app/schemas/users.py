import uuid

from pydantic import BaseModel

from app.models.user import AccountType, Locale, NewlywedProfile, ServiceProfile, User


class NewlywedProfileOut(BaseModel):
    display_name: str | None
    phone: str | None

    @classmethod
    def build(cls, profile: NewlywedProfile) -> "NewlywedProfileOut":
        return cls(display_name=profile.display_name, phone=profile.phone)


class ServiceProfileOut(BaseModel):
    business_name: str
    contact_name: str | None
    phone: str | None
    website: str | None
    instagram: str | None

    @classmethod
    def build(cls, profile: ServiceProfile) -> "ServiceProfileOut":
        return cls(
            business_name=profile.business_name,
            contact_name=profile.contact_name,
            phone=profile.phone,
            website=profile.website,
            instagram=profile.instagram,
        )


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    account_type: AccountType
    locale: Locale
    email_verified: bool
    newlywed_profile: NewlywedProfileOut | None
    service_profile: ServiceProfileOut | None

    @classmethod
    def build(cls, user: User) -> "MeOut":
        """`user` must have its profiles loaded."""
        return cls(
            id=user.public_id,
            email=user.email,
            account_type=user.account_type,
            locale=user.locale,
            email_verified=user.is_email_verified,
            newlywed_profile=(
                NewlywedProfileOut.build(user.newlywed_profile) if user.newlywed_profile else None
            ),
            service_profile=(
                ServiceProfileOut.build(user.service_profile) if user.service_profile else None
            ),
        )
