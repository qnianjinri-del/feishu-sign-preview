use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_autostart::MacosLauncher;

mod sync;

struct TrayMenuState {
    always_on_top: CheckMenuItem<tauri::Wry>,
    click_through: CheckMenuItem<tauri::Wry>,
    launch_at_login: CheckMenuItem<tauri::Wry>,
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => hide_main_window(app),
            _ => show_main_window(app),
        }
    }
}

#[tauri::command]
fn sync_tray_state(
    state: State<'_, TrayMenuState>,
    always_on_top: bool,
    click_through: bool,
    launch_at_login: bool,
) -> Result<(), String> {
    state
        .always_on_top
        .set_checked(always_on_top)
        .map_err(|error| error.to_string())?;
    state
        .click_through
        .set_checked(click_through)
        .map_err(|error| error.to_string())?;
    state
        .launch_at_login
        .set_checked(launch_at_login)
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// If the Store plugin cannot parse its JSON, preserve the original file before retrying.
#[tauri::command]
fn backup_corrupt_store(app: AppHandle) -> Result<Option<String>, String> {
    let source = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("floatlist.json");
    if !source.exists() {
        return Ok(None);
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let backup = source.with_file_name(format!("floatlist.corrupt-{timestamp}.json"));
    fs::rename(&source, &backup).map_err(|error| error.to_string())?;
    Ok(Some(backup.to_string_lossy().into_owned()))
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示 FloatList", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏 FloatList", true, None::<&str>)?;
    let always_on_top =
        CheckMenuItem::with_id(app, "always_on_top", "始终置顶", true, true, None::<&str>)?;
    let click_through =
        CheckMenuItem::with_id(app, "click_through", "点击穿透", true, false, None::<&str>)?;
    let new_task = MenuItem::with_id(app, "new_task", "新建任务", true, Some("CmdOrCtrl+N"))?;
    let settings = MenuItem::with_id(app, "settings", "设置…", true, Some("CmdOrCtrl+,"))?;
    let launch_at_login = CheckMenuItem::with_id(
        app,
        "launch_at_login",
        "开机启动",
        true,
        false,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "退出 FloatList", true, Some("CmdOrCtrl+Q"))?;
    let separator_one = PredefinedMenuItem::separator(app)?;
    let separator_two = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &show,
            &hide,
            &separator_one,
            &always_on_top,
            &click_through,
            &new_task,
            &settings,
            &launch_at_login,
            &separator_two,
            &quit,
        ],
    )?;

    app.manage(TrayMenuState {
        always_on_top: always_on_top.clone(),
        click_through: click_through.clone(),
        launch_at_login: launch_at_login.clone(),
    });

    let mut tray_builder = TrayIconBuilder::with_id("floatlist-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("FloatList 悬浮清单")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            "always_on_top" => {
                show_main_window(app);
                let _ = app.emit("floatlist://toggle-always-on-top", ());
            }
            "click_through" => {
                let _ = app.emit("floatlist://toggle-click-through", ());
            }
            "new_task" => {
                show_main_window(app);
                let _ = app.emit("floatlist://new-task", ());
            }
            "settings" => {
                show_main_window(app);
                let _ = app.emit("floatlist://open-settings", ());
            }
            "launch_at_login" => {
                let _ = app.emit("floatlist://toggle-launch-at-login", ());
            }
            "quit" => {
                let _ = app.emit("floatlist://quit-requested", ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }
    tray_builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .invoke_handler(tauri::generate_handler![
            backup_corrupt_store,
            quit_app,
            sync_tray_state,
            sync::sync_delete_client_token,
            sync::sync_fetch_snapshot,
            sync::sync_has_client_token,
            sync::sync_probe_service,
            sync::sync_send_mutations,
            sync::sync_set_client_token,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            build_tray(app)?;

            // The autostart entry passes --hidden so login does not interrupt the user.
            if std::env::args().any(|argument| argument == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("FloatList 启动失败");
}
