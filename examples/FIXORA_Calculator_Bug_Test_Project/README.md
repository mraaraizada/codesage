# FIXORA Test Repository: Calculator API

A deliberately buggy Python calculator module for testing an AI debugging agent.

## Requirements
- Python 3.9+
- pytest

## Run the tests
```bash
python -m pip install -r requirements.txt
pytest -q
```

The tests are expected to FAIL before the fix is applied.

## Expected behavior
- `add(a, b)` returns the sum.
- `subtract(a, b)` returns the difference.
- `multiply(a, b)` returns the product.
- `divide(a, b)` returns the quotient.
- Division by zero raises `ValueError`.

See `BUG_REPORT.md` for the issue to give FIXORA.
