import type { StateCreator } from "zustand";
import type { SettingsSlice } from "./slices/settingsSlice";
import type { SyncSlice } from "./slices/syncSlice";
import type { TaskSlice } from "./slices/taskSlice";

export interface TaskStoreState extends TaskSlice, SettingsSlice, SyncSlice {}

export type StoreSliceCreator<T> = StateCreator<TaskStoreState, [], [], T>;
