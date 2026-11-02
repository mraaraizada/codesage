import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Explicit cleanup between tests (we run with `globals: false`, so @testing-library/react's
// implicit afterEach auto-registration doesn't fire).
afterEach(() => {
  cleanup();
});
