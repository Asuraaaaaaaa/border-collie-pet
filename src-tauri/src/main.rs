#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

fn main() {
    tauri::Builder::default()
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
                                let _ = window.eval("alert('边牧桌宠 v0.1\\n\\n一只住在桌面上的小边牧。\\n左键点击：互动\\n按住拖拽：移动\\n长时间不理它：睡觉');");
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
            // When the pet window is closed (e.g. via right-click menu "quit"),
            // exit the entire app process.
            if let tauri::WindowEvent::Destroyed = event {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
