#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{
    Emitter, Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

/// Map rdev::Key to a short string identifier the frontend can match against
/// its virtual keyboard buttons (data-code attribute).
fn key_to_code(key: &rdev::Key) -> Option<String> {
    use rdev::Key::*;
    let s = match key {
        // function row
        Escape => "Escape", F1 => "F1", F2 => "F2", F3 => "F3", F4 => "F4",
        F5 => "F5", F6 => "F6", F7 => "F7", F8 => "F8", F9 => "F9",
        F10 => "F10", F11 => "F11", F12 => "F12",
        // number row
        BackQuote => "Backquote", Num1 => "Digit1", Num2 => "Digit2",
        Num3 => "Digit3", Num4 => "Digit4", Num5 => "Digit5", Num6 => "Digit6",
        Num7 => "Digit7", Num8 => "Digit8", Num9 => "Digit9", Num0 => "Digit0",
        Minus => "Minus", Equal => "Equal", BackSpace => "Backspace",
        // letter row 1
        KeyQ => "KeyQ", KeyW => "KeyW", KeyE => "KeyE", KeyR => "KeyR", KeyT => "KeyT",
        KeyY => "KeyY", KeyU => "KeyU", KeyI => "KeyI", KeyO => "KeyO", KeyP => "KeyP",
        LeftBracket => "BracketLeft", RightBracket => "BracketRight",
        // letter row 2
        CapsLock => "CapsLock",
        KeyA => "KeyA", KeyS => "KeyS", KeyD => "KeyD", KeyF => "KeyF", KeyG => "KeyG",
        KeyH => "KeyH", KeyJ => "KeyJ", KeyK => "KeyK", KeyL => "KeyL",
        SemiColon => "Semicolon", Quote => "Quote", Return => "Enter",
        // letter row 3
        LeftShift => "ShiftLeft",
        KeyZ => "KeyZ", KeyX => "KeyX", KeyC => "KeyC", KeyV => "KeyV", KeyB => "KeyB",
        KeyN => "KeyN", KeyM => "KeyM", Comma => "Comma", Dot => "Period",
        Slash => "Slash", RightShift => "ShiftRight",
        // bottom row
        LeftControl => "ControlLeft", LeftAlt => "AltLeft", Space => "Space",
        RightAlt => "AltRight", RightControl => "ControlRight",
        // navigation
        Tab => "Tab", Delete => "Delete",
        Home => "Home", End => "End", PageUp => "PageUp", PageDown => "PageDown",
        UpArrow => "ArrowUp", DownArrow => "ArrowDown",
        LeftArrow => "ArrowLeft", RightArrow => "ArrowRight",
        // numpad
        Numpad0 => "Numpad0", Numpad1 => "Numpad1", Numpad2 => "Numpad2",
        Numpad3 => "Numpad3", Numpad4 => "Numpad4", Numpad5 => "Numpad5",
        Numpad6 => "Numpad6", Numpad7 => "Numpad7", Numpad8 => "Numpad8",
        Numpad9 => "Numpad9",
        NumpadSubtract => "NumpadSubtract", NumpadAdd => "NumpadAdd",
        NumpadMultiply => "NumpadMultiply", NumpadDivide => "NumpadDivide",
        NumpadDecimal => "NumpadDecimal", NumpadEnter => "NumpadEnter",
        _ => return None,
    };
    Some(s.to_string())
}

/// Start a background thread that listens for key presses globally via rdev
/// and emits a Tauri event to the frontend for each keydown.
/// If rdev fails (e.g. no accessibility permission on macOS), emits a
/// "kb-listen-error" event so the frontend can fall back to window keydown.
fn start_key_listener(app_handle: Arc<tauri::AppHandle>) {
    std::thread::spawn(move || {
        let handle_for_errors = app_handle.clone();
        let callback = move |event: rdev::Event| {
            if let rdev::EventType::KeyPress(key) = event.event_type {
                if let Some(code) = key_to_code(&key) {
                    let _ = app_handle.emit("global-keydown", code);
                }
            }
        };
        match rdev::listen(callback) {
            Ok(()) => { /* listener ended normally */ }
            Err(e) => {
                eprintln!("rdev listen error: {:?}", e);
                let _ = handle_for_errors.emit("kb-listen-error", format!("{:?}", e));
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // macOS: hide the Dock icon, pet lives in the menu bar only
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // NOTE: rdev global keyboard listener is disabled because it
            // crashes the process on macOS without accessibility permission.
            // The frontend uses window keydown as a fallback instead.
            // To re-enable: grant accessibility permission to the .app bundle,
            // then uncomment the two lines below.
            // let handle = Arc::new(app.handle().clone());
            // start_key_listener(handle);
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
