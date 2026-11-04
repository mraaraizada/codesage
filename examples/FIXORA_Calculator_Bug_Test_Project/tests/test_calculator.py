import pytest

from calculator import add, subtract, multiply, divide


def test_add():
    assert add(2, 3) == 5


def test_subtract():
    assert subtract(8, 3) == 5


def test_multiply():
    assert multiply(4, 3) == 12


def test_divide_basic():
    assert divide(10, 2) == 5


def test_divide_second_case():
    assert divide(20, 4) == 5


def test_divide_zero_raises_value_error():
    with pytest.raises(ValueError, match="zero"):
        divide(10, 0)
