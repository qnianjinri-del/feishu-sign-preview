import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AddTask } from "../src/components/AddTask/AddTask";
import { resetTaskStoreForTests, useTaskStore } from "../src/stores/taskStore";
import { DEFAULT_SETTINGS } from "../src/utils/defaults";

describe("AddTask", () => {
  beforeEach(() => resetTaskStoreForTests({ schemaVersion: 4, tasks: [], settings: { ...DEFAULT_SETTINGS }, sync: { outbox: [] } }));

  it("does not create an empty task", async () => {
    render(<AddTask focusSignal={0} />);
    await userEvent.click(screen.getByRole("button", { name: /添加任务/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "新任务" }), "   {Enter}");
    expect(useTaskStore.getState().tasks).toHaveLength(0);
  });

  it("creates one task per non-empty pasted line", async () => {
    render(<AddTask focusSignal={1} />);
    const input = screen.getByRole("textbox", { name: "新任务" });
    fireEvent.paste(input, { clipboardData: { getData: () => "一\n\n二" } });
    expect(useTaskStore.getState().tasks.map((task) => task.text)).toEqual(["一", "二"]);
  });
});
