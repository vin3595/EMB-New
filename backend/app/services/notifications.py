import base64

from fastapi import HTTPException


def send_email_with_attachment(
    api_key: str,
    from_email: str,
    to_email: str,
    subject: str,
    html_body: str,
    attachment_bytes: bytes | None = None,
    attachment_name: str | None = None,
    mime_type: str = "application/pdf",
) -> None:
    if not api_key or not from_email:
        raise HTTPException(status_code=400, detail="SendGrid is not configured for this account — add a SendGrid API key in Settings")

    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Attachment, Disposition, FileContent, FileName, FileType, Mail

    message = Mail(from_email=from_email, to_emails=to_email, subject=subject, html_content=html_body)
    if attachment_bytes:
        message.attachment = Attachment(
            FileContent(base64.b64encode(attachment_bytes).decode()),
            FileName(attachment_name or "attachment.pdf"),
            FileType(mime_type),
            Disposition("attachment"),
        )
    SendGridAPIClient(api_key).send(message)
