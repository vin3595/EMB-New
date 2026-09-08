from pydantic import BaseModel


class CompanyProfile(BaseModel):
    name: str = ""
    gstin: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    ca_email: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    sendgrid_api_key: str = ""
    msg91_auth_key: str = ""
    msg91_sender_id: str = ""
