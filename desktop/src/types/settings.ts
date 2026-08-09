export type ThemeMode = "system" | "light" | "dark";

export interface AppSettings {
  schemaVersion: number;
  listTitle: string;
  opacity: number;
  alwaysOnTop: boolean;
  showCompleted: boolean;
  compactMode: boolean;
  theme: ThemeMode;
  clickThrough: boolean;
  launchAtLogin: boolean;
  toggleWindowShortcut: string;
  toggleClickThroughShortcut: string;
  quickAddShortcut: string;
  onboardingCompleted: boolean;
  syncEnabled: boolean;
  syncServiceUrl: string;
  syncPollIntervalSeconds: number;
}
