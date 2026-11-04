"""Basic calculator operations."""

def add(a, b):
    return a + b


def subtract(a, b):
    return a - b


def multiply(a, b):
    return a * b


def divide(a, b):
    # BUG: uses multiplication instead of division.
    # BUG: silently returns 0 when dividing by zero.
    if b == 0:
        return 0
    return a * b
