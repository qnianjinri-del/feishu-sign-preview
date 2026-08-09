import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskFilter } from "../src/components/TaskFilter/TaskFilter";

describe("TaskFilter", () => {
  it("clears a query before closing on Escape", async () => {
    const onQueryChange = vi.fn();
    const onClose = vi.fn();
    render(
      <TaskFilter
        focusSignal={1}
        mode="current"
        query="发布"
        resultCount={2}
        onModeChange={() => undefined}
        onQueryChange={onQueryChange}
        onClose={onClose}
      />,
    );
    expect(screen.getByText("2 项")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape when the query is already empty", async () => {
    const onClose = vi.fn();
    render(
      <TaskFilter
        focusSignal={1}
        mode="current"
        query=""
        resultCount={0}
        onModeChange={() => undefined}
        onQueryChange={() => undefined}
        onClose={onClose}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
