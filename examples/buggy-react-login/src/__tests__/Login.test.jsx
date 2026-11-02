import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Login } from "../Login.jsx";

describe("Login", () => {
  it("navigates to the dashboard after a successful login", () => {
    const navigate = vi.fn();
    render(<Login navigate={navigate} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "demo" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByTestId("logged-in-indicator")).toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("shows an error and does not navigate on invalid credentials", () => {
    const navigate = vi.fn();
    render(<Login navigate={navigate} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "demo" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/invalid/i);
    expect(navigate).not.toHaveBeenCalled();
  });
});
