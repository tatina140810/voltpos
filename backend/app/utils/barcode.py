def generate_ean13(product_id: int) -> str:
    base = f"200{product_id:09d}"[:12]
    digits = [int(d) for d in base]
    odd_sum = sum(digits[::2])
    even_sum = sum(digits[1::2])
    checksum = (10 - ((odd_sum + even_sum * 3) % 10)) % 10
    return f"{base}{checksum}"
