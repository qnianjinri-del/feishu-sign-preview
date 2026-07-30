import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { UndoToast } from "../src/components/UndoToast/UndoToast";
import { resetTaskStoreForTests, useTaskStore } from "../src/stores/taskStore";
import { DEFAULT_SETTINGS } from "../src/utils/defaults";

describe("UndoToast", () => {
  beforeEach(() => resetTaskStoreForTests({ schemaVersion: 3, tasks: [], settings: { ...DEFAULT_SETTINGS }, sync: { outbox: [] } }));

  it("restores a deleted task", async () => {
    useTaskStore.getState().addTask("可撤销");
    useTaskStore.getState().deleteTask(useTaskStore.getState().tasks[0].id);
    render(<UndoToast />);
    await userEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(useTaskStore.getState().tasks[0].text).toBe("可撤销");
  });
});
