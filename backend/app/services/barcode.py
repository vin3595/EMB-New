def build_zpl_label(lot_number: str, item_name: str, quantity: float, unit: str) -> str:
    """Zebra ZPL for an 80mm production-lot label with a Code128 barcode."""
    return (
        "^XA\n"
        "^PW640\n"
        f"^FO40,30^A0N,36,36^FD{item_name[:32]}^FS\n"
        f"^FO40,80^A0N,28,28^FD{quantity:g} {unit}^FS\n"
        f"^FO40,130^BY3^BCN,100,Y,N,N^FD{lot_number}^FS\n"
        "^XZ"
    )
