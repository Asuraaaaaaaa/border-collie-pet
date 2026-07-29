#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod keyboard;

use tauri::{
    Emitter, Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // macOS: hide the Dock icon, pet lives in the menu bar only
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // NOTE: rdev global keyboard listener is disabled because it
            // crashes the process on macOS without accessibility permission.
            // The frontend uses window keydown as a fallback instead.
            let _ = app.emit("kb-listen-error", "rdev disabled");

            let show = MenuItemBuilder::with_id("show", "显示宠物").build(app)?;
            let hide = MenuItemBuilder::with_id("hide", "隐藏宠物").build(app)?;
            let top  = MenuItemBuilder::with_id("top",  "始终置顶").build(app)?;
            let about = MenuItemBuilder::with_id("about", "关于").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show)
                .item(&hide)
                .item(&top)
                .item(&about)
                .separator()
                .item(&quit)
                .build()?;
            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("边牧桌宠")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if let Some(window) = app.get_webview_window("main") {
                        match id {
                            "show" => { let _ = window.show(); let _ = window.set_focus(); }
                            "hide" => { let _ = window.hide(); }
                            "top"  => {
                                let cur = window.is_always_on_top().unwrap_or(true);
                                let _ = window.set_always_on_top(!cur);
                            }
                            "about" => {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.open_devtools();
                            }
                            "quit" => app.exit(0),
                            _ => {}
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
