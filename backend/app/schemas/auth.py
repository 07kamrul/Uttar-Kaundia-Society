from pydantic import BaseModel

from app.core.password_policy import MIN_PASSWORD_LENGTH, check_new_password  # noqa: F401


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class MemberLoginRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    identifier: str
    password: str


class ForgotPasswordRequest(BaseModel):
    identifier: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ResetPasswordOK(BaseModel):
    status: str = "ok"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_change_password: bool = False
    role: str | None = None
    permissions: list[str] = []


class MediaTokenResponse(BaseModel):
    """Short-lived token appended as ``?t=`` to /uploads file URLs."""

    media_token: str
    expires_in: int


class ChangePasswordResponse(BaseModel):
    """Fresh tokens for the caller: changing the password revokes every
    earlier token (token_version bump), including the one used for the call."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def validate_new_password(
    current_password: str, new_password: str, *, policy_v2: bool = False
) -> dict[str, str]:
    """Return field-level errors for a proposed new password (empty when valid).

    Routes that also need the machine code call ``check_new_password`` directly."""
    issue = check_new_password(current_password, new_password, policy_v2=policy_v2)
    return {} if issue is None else {"new_password": issue.message}
