# Bug Report

## Title
Calculator division endpoint returns incorrect results

## Description
The calculator's division operation is returning incorrect results. For example,
dividing 10 by 2 returns 20 instead of 5.

There is also incorrect behavior when the divisor is zero: the function returns
0, which hides an invalid operation instead of reporting it.

## Steps to reproduce
1. Import `divide` from `calculator.py`.
2. Call `divide(10, 2)`.
3. Observe that the result is 20 rather than 5.
4. Call `divide(10, 0)`.
5. Observe that the function returns 0 instead of raising an error.

## Expected behavior
- `divide(10, 2)` returns `5`.
- `divide(20, 4)` returns `5`.
- `divide(9, 3)` returns `3`.
- `divide(10, 0)` raises `ValueError`.

## Request
Inspect the repository, identify the root cause, propose a minimal patch,
explain which file and function are affected, and run the tests after applying
the patch in an isolated working copy. Report actual test output. Do not claim
the issue is fixed unless the tests pass.
