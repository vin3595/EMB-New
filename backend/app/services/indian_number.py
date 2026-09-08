"""Indian numbering (lakh/crore) formatting helpers, used by every server-rendered
amount so the frontend never re-derives money formatting from floats."""

ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def format_inr(amount: float) -> str:
    """12345678.9 -> '₹1,23,45,678.90'"""
    negative = amount < 0
    amount = round(abs(float(amount)), 2)
    rupees = int(amount)
    paise = round((amount - rupees) * 100)
    rupee_str = str(rupees)

    if len(rupee_str) <= 3:
        grouped = rupee_str
    else:
        last3 = rupee_str[-3:]
        rest = rupee_str[:-3]
        parts = []
        while len(rest) > 2:
            parts.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            parts.insert(0, rest)
        grouped = ",".join(parts) + "," + last3

    result = f"₹{grouped}.{paise:02d}"
    return f"-{result}" if negative else result


def _two_digit_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    tens, ones = divmod(n, 10)
    return f"{TENS[tens]} {ONES[ones]}".strip()


def _three_digit_words(n: int) -> str:
    hundreds, rem = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(f"{ONES[hundreds]} Hundred")
    if rem:
        parts.append(_two_digit_words(rem))
    return " ".join(parts)


def amount_in_words(amount: float) -> str:
    """12345678.90 -> 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred
    Seventy Eight Rupees and Ninety Paise Only'"""
    amount = round(abs(float(amount)), 2)
    rupees = int(amount)
    paise = round((amount - rupees) * 100)

    if rupees == 0:
        words = "Zero"
    else:
        crore, rupees = divmod(rupees, 10_000_000)
        lakh, rupees = divmod(rupees, 100_000)
        thousand, rupees = divmod(rupees, 1000)
        hundred_rem = rupees

        segments = []
        if crore:
            segments.append(f"{_three_digit_words(crore)} Crore")
        if lakh:
            segments.append(f"{_three_digit_words(lakh)} Lakh")
        if thousand:
            segments.append(f"{_three_digit_words(thousand)} Thousand")
        if hundred_rem:
            segments.append(_three_digit_words(hundred_rem))
        words = " ".join(segments).strip()

    result = f"{words} Rupees"
    if paise:
        result += f" and {_two_digit_words(paise)} Paise"
    return f"{result} Only"
