import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { EmptyState } from "../src/components/EmptyState/EmptyState";

it("starts adding from the empty state", async () => {
  const onAdd = vi.fn();
  render(<EmptyState onAdd={onAdd} />);
  await userEvent.click(screen.getByRole("button"));
  expect(onAdd).toHaveBeenCalledOnce();
});
