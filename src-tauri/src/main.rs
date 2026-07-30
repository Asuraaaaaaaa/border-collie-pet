#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod keyboard;

use tauri::{
    Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // macOS: hide the Dock icon, pet lives in the menu bar only
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

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
                                let _ = window.eval(r#"window.alert("边牧桌宠 v0.3.0\n\n一只住在桌面上的小边牧。\n左键点击：互动\n按住拖拽：移动\n滚轮：调整大小\n右键：打开功能菜单");"#);
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
        .manage(keyboard::KeyboardListenerState::default())
        .invoke_handler(tauri::generate_handler![keyboard::start_keyboard_listener])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
