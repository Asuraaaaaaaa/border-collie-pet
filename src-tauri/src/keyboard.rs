use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use tauri::Emitter;

#[cfg(target_os = "macos")]
fn macos_keycode_to_code(keycode: u16) -> Option<&'static str> {
    match keycode {
        0 => Some("KeyA"),
        1 => Some("KeyS"),
        2 => Some("KeyD"),
        3 => Some("KeyF"),
        4 => Some("KeyH"),
        5 => Some("KeyG"),
        6 => Some("KeyZ"),
        7 => Some("KeyX"),
        8 => Some("KeyC"),
        9 => Some("KeyV"),
        11 => Some("KeyB"),
        12 => Some("KeyQ"),
        13 => Some("KeyW"),
        14 => Some("KeyE"),
        15 => Some("KeyR"),
        16 => Some("KeyY"),
        17 => Some("KeyT"),
        18 => Some("Digit1"),
        19 => Some("Digit2"),
        20 => Some("Digit3"),
        21 => Some("Digit4"),
        22 => Some("Digit6"),
        23 => Some("Digit5"),
        24 => Some("Equal"),
        25 => Some("Digit9"),
        26 => Some("Digit7"),
        27 => Some("Minus"),
        28 => Some("Digit8"),
        29 => Some("Digit0"),
        30 => Some("BracketRight"),
        31 => Some("KeyO"),
        32 => Some("KeyU"),
        33 => Some("BracketLeft"),
        34 => Some("KeyI"),
        35 => Some("KeyP"),
        36 => Some("Enter"),
        37 => Some("KeyL"),
        38 => Some("KeyJ"),
        39 => Some("Quote"),
        40 => Some("KeyK"),
        41 => Some("Semicolon"),
        42 => Some("Backslash"),
        43 => Some("Comma"),
        44 => Some("Slash"),
        45 => Some("KeyN"),
        46 => Some("KeyM"),
        47 => Some("Period"),
        48 => Some("Tab"),
        49 => Some("Space"),
        50 => Some("Backquote"),
        51 => Some("Backspace"),
        53 => Some("Escape"),
        56 => Some("ShiftLeft"),
        57 => Some("CapsLock"),
        58 => Some("AltLeft"),
        59 => Some("ControlLeft"),
        60 => Some("ShiftRight"),
        61 => Some("AltRight"),
        62 => Some("ControlRight"),
        65 => Some("NumpadDecimal"),
        67 => Some("NumpadMultiply"),
        69 => Some("NumpadAdd"),
        75 => Some("NumpadDivide"),
        76 => Some("NumpadEnter"),
        78 => Some("NumpadSubtract"),
        82 => Some("Numpad0"),
        83 => Some("Numpad1"),
        84 => Some("Numpad2"),
        85 => Some("Numpad3"),
        86 => Some("Numpad4"),
        87 => Some("Numpad5"),
        88 => Some("Numpad6"),
        89 => Some("Numpad7"),
        91 => Some("Numpad8"),
        92 => Some("Numpad9"),
        96 => Some("F5"),
        97 => Some("F6"),
        98 => Some("F7"),
        99 => Some("F3"),
        100 => Some("F8"),
        101 => Some("F9"),
        103 => Some("F11"),
        109 => Some("F10"),
        111 => Some("F12"),
        115 => Some("Home"),
        116 => Some("PageUp"),
        117 => Some("Delete"),
        118 => Some("F4"),
        119 => Some("End"),
        120 => Some("F2"),
        121 => Some("PageDown"),
        122 => Some("F1"),
        123 => Some("ArrowLeft"),
        124 => Some("ArrowRight"),
        125 => Some("ArrowDown"),
        126 => Some("ArrowUp"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn macos_modifier_is_pressed(
    keycode: u16,
    flags: core_graphics::event::CGEventFlags,
) -> bool {
    use core_graphics::event::CGEventFlags;

    match keycode {
        56 | 60 => flags.contains(CGEventFlags::CGEventFlagShift),
        57 => true,
        58 | 61 => flags.contains(CGEventFlags::CGEventFlagAlternate),
        59 | 62 => flags.contains(CGEventFlags::CGEventFlagControl),
        _ => false,
    }
}

#[cfg(target_os = "macos")]
fn listen_for_keyboard_events(app: tauri::AppHandle) -> Result<(), String> {
    use core_foundation::runloop::CFRunLoop;
    use core_graphics::event::{
        CallbackResult, CGEventTap, CGEventTapLocation, CGEventTapOptions,
        CGEventTapPlacement, CGEventType, EventField,
    };

    CGEventTap::with_enabled(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        vec![CGEventType::KeyDown, CGEventType::FlagsChanged],
        move |_proxy, event_type, event| {
            let keycode =
                event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16;
            let is_press = match event_type {
                CGEventType::KeyDown => true,
                CGEventType::FlagsChanged => {
                    macos_modifier_is_pressed(keycode, event.get_flags())
                }
                _ => false,
            };

            if is_press {
                if let Some(code) = macos_keycode_to_code(keycode) {
                    let _ = app.emit("global-keydown", code);
                }
            }
            CallbackResult::Keep
        },
        CFRunLoop::run_current,
    )
    .map_err(|()| "could not create macOS keyboard event tap".to_string())
}

#[cfg(not(target_os = "macos"))]
fn listen_for_keyboard_events(app: tauri::AppHandle) -> Result<(), String> {
    rdev::listen(move |event| {
        if let rdev::EventType::KeyPress(key) = event.event_type {
            if let Some(code) = key_to_code(&key) {
                let _ = app.emit("global-keydown", code);
            }
        }
    })
    .map_err(|error| format!("{error:?}"))
}

pub fn key_to_code(key: &rdev::Key) -> Option<&'static str> {
    use rdev::Key::*;

    match key {
        Escape => Some("Escape"),
        F1 => Some("F1"),
        F2 => Some("F2"),
        F3 => Some("F3"),
        F4 => Some("F4"),
        F5 => Some("F5"),
        F6 => Some("F6"),
        F7 => Some("F7"),
        F8 => Some("F8"),
        F9 => Some("F9"),
        F10 => Some("F10"),
        F11 => Some("F11"),
        F12 => Some("F12"),
        BackQuote => Some("Backquote"),
        Num1 => Some("Digit1"),
        Num2 => Some("Digit2"),
        Num3 => Some("Digit3"),
        Num4 => Some("Digit4"),
        Num5 => Some("Digit5"),
        Num6 => Some("Digit6"),
        Num7 => Some("Digit7"),
        Num8 => Some("Digit8"),
        Num9 => Some("Digit9"),
        Num0 => Some("Digit0"),
        Minus => Some("Minus"),
        Equal => Some("Equal"),
        Backspace => Some("Backspace"),
        KeyQ => Some("KeyQ"),
        KeyW => Some("KeyW"),
        KeyE => Some("KeyE"),
        KeyR => Some("KeyR"),
        KeyT => Some("KeyT"),
        KeyY => Some("KeyY"),
        KeyU => Some("KeyU"),
        KeyI => Some("KeyI"),
        KeyO => Some("KeyO"),
        KeyP => Some("KeyP"),
        LeftBracket => Some("BracketLeft"),
        RightBracket => Some("BracketRight"),
        BackSlash => Some("Backslash"),
        CapsLock => Some("CapsLock"),
        KeyA => Some("KeyA"),
        KeyS => Some("KeyS"),
        KeyD => Some("KeyD"),
        KeyF => Some("KeyF"),
        KeyG => Some("KeyG"),
        KeyH => Some("KeyH"),
        KeyJ => Some("KeyJ"),
        KeyK => Some("KeyK"),
        KeyL => Some("KeyL"),
        SemiColon => Some("Semicolon"),
        Quote => Some("Quote"),
        Return => Some("Enter"),
        ShiftLeft => Some("ShiftLeft"),
        KeyZ => Some("KeyZ"),
        KeyX => Some("KeyX"),
        KeyC => Some("KeyC"),
        KeyV => Some("KeyV"),
        KeyB => Some("KeyB"),
        KeyN => Some("KeyN"),
        KeyM => Some("KeyM"),
        Comma => Some("Comma"),
        Dot => Some("Period"),
        Slash => Some("Slash"),
        ShiftRight => Some("ShiftRight"),
        ControlLeft => Some("ControlLeft"),
        Alt => Some("AltLeft"),
        Space => Some("Space"),
        AltGr => Some("AltRight"),
        ControlRight => Some("ControlRight"),
        Tab => Some("Tab"),
        Delete => Some("Delete"),
        Home => Some("Home"),
        End => Some("End"),
        PageUp => Some("PageUp"),
        PageDown => Some("PageDown"),
        UpArrow => Some("ArrowUp"),
        DownArrow => Some("ArrowDown"),
        LeftArrow => Some("ArrowLeft"),
        RightArrow => Some("ArrowRight"),
        Kp0 => Some("Numpad0"),
        Kp1 => Some("Numpad1"),
        Kp2 => Some("Numpad2"),
        Kp3 => Some("Numpad3"),
        Kp4 => Some("Numpad4"),
        Kp5 => Some("Numpad5"),
        Kp6 => Some("Numpad6"),
        Kp7 => Some("Numpad7"),
        Kp8 => Some("Numpad8"),
        Kp9 => Some("Numpad9"),
        KpMinus => Some("NumpadSubtract"),
        KpPlus => Some("NumpadAdd"),
        KpMultiply => Some("NumpadMultiply"),
        KpDivide => Some("NumpadDivide"),
        KpDelete => Some("NumpadDecimal"),
        KpReturn => Some("NumpadEnter"),
        _ => None,
    }
}

#[derive(Clone, Default)]
pub struct KeyboardListenerState {
    started: Arc<AtomicBool>,
}

impl KeyboardListenerState {
    fn claim_start(&self) -> bool {
        self.started
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    fn release(&self) {
        self.started.store(false, Ordering::Release);
    }

    fn listener_error(&self) -> KeyboardStatus {
        self.release();
        KeyboardStatus::fallback("listener-error")
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct KeyboardStatus {
    status: &'static str,
    reason: Option<&'static str>,
}

impl KeyboardStatus {
    fn active() -> Self {
        Self {
            status: "active",
            reason: None,
        }
    }

    fn fallback(reason: &'static str) -> Self {
        Self {
            status: "fallback",
            reason: Some(reason),
        }
    }
}

#[tauri::command]
pub fn start_keyboard_listener(
    app: tauri::AppHandle,
    state: tauri::State<'_, KeyboardListenerState>,
) -> KeyboardStatus {
    #[cfg(target_os = "macos")]
    if !macos_accessibility_client::accessibility::application_is_trusted_with_prompt() {
        return KeyboardStatus::fallback("permission-required");
    }

    if !state.claim_start() {
        return KeyboardStatus::active();
    }

    let listener_state = state.inner().clone();
    std::thread::spawn(move || {
        let result = listen_for_keyboard_events(app.clone());

        match result {
            Ok(()) => eprintln!("global keyboard listener stopped unexpectedly"),
            Err(error) => eprintln!("global keyboard listener error: {error}"),
        }
        let status = listener_state.listener_error();
        let _ = app.emit("keyboard-listener-status", status);
    });

    KeyboardStatus::active()
}

#[cfg(test)]
mod tests {
    use super::{key_to_code, KeyboardListenerState, KeyboardStatus};
    use rdev::Key;
    use serde_json::json;

    #[test]
    fn maps_supported_keys_to_browser_codes() {
        let cases = [
            (Key::Escape, "Escape"),
            (Key::F1, "F1"),
            (Key::F2, "F2"),
            (Key::F3, "F3"),
            (Key::F4, "F4"),
            (Key::F5, "F5"),
            (Key::F6, "F6"),
            (Key::F7, "F7"),
            (Key::F8, "F8"),
            (Key::F9, "F9"),
            (Key::F10, "F10"),
            (Key::F11, "F11"),
            (Key::F12, "F12"),
            (Key::BackQuote, "Backquote"),
            (Key::Num1, "Digit1"),
            (Key::Num2, "Digit2"),
            (Key::Num3, "Digit3"),
            (Key::Num4, "Digit4"),
            (Key::Num5, "Digit5"),
            (Key::Num6, "Digit6"),
            (Key::Num7, "Digit7"),
            (Key::Num8, "Digit8"),
            (Key::Num9, "Digit9"),
            (Key::Num0, "Digit0"),
            (Key::Minus, "Minus"),
            (Key::Equal, "Equal"),
            (Key::Backspace, "Backspace"),
            (Key::KeyQ, "KeyQ"),
            (Key::KeyW, "KeyW"),
            (Key::KeyE, "KeyE"),
            (Key::KeyR, "KeyR"),
            (Key::KeyT, "KeyT"),
            (Key::KeyY, "KeyY"),
            (Key::KeyU, "KeyU"),
            (Key::KeyI, "KeyI"),
            (Key::KeyO, "KeyO"),
            (Key::KeyP, "KeyP"),
            (Key::LeftBracket, "BracketLeft"),
            (Key::RightBracket, "BracketRight"),
            (Key::BackSlash, "Backslash"),
            (Key::CapsLock, "CapsLock"),
            (Key::KeyA, "KeyA"),
            (Key::KeyS, "KeyS"),
            (Key::KeyD, "KeyD"),
            (Key::KeyF, "KeyF"),
            (Key::KeyG, "KeyG"),
            (Key::KeyH, "KeyH"),
            (Key::KeyJ, "KeyJ"),
            (Key::KeyK, "KeyK"),
            (Key::KeyL, "KeyL"),
            (Key::SemiColon, "Semicolon"),
            (Key::Quote, "Quote"),
            (Key::Return, "Enter"),
            (Key::ShiftLeft, "ShiftLeft"),
            (Key::KeyZ, "KeyZ"),
            (Key::KeyX, "KeyX"),
            (Key::KeyC, "KeyC"),
            (Key::KeyV, "KeyV"),
            (Key::KeyB, "KeyB"),
            (Key::KeyN, "KeyN"),
            (Key::KeyM, "KeyM"),
            (Key::Comma, "Comma"),
            (Key::Dot, "Period"),
            (Key::Slash, "Slash"),
            (Key::ShiftRight, "ShiftRight"),
            (Key::ControlLeft, "ControlLeft"),
            (Key::Alt, "AltLeft"),
            (Key::Space, "Space"),
            (Key::AltGr, "AltRight"),
            (Key::ControlRight, "ControlRight"),
            (Key::Tab, "Tab"),
            (Key::Delete, "Delete"),
            (Key::Home, "Home"),
            (Key::End, "End"),
            (Key::PageUp, "PageUp"),
            (Key::PageDown, "PageDown"),
            (Key::UpArrow, "ArrowUp"),
            (Key::DownArrow, "ArrowDown"),
            (Key::LeftArrow, "ArrowLeft"),
            (Key::RightArrow, "ArrowRight"),
            (Key::Kp0, "Numpad0"),
            (Key::Kp1, "Numpad1"),
            (Key::Kp2, "Numpad2"),
            (Key::Kp3, "Numpad3"),
            (Key::Kp4, "Numpad4"),
            (Key::Kp5, "Numpad5"),
            (Key::Kp6, "Numpad6"),
            (Key::Kp7, "Numpad7"),
            (Key::Kp8, "Numpad8"),
            (Key::Kp9, "Numpad9"),
            (Key::KpMinus, "NumpadSubtract"),
            (Key::KpPlus, "NumpadAdd"),
            (Key::KpMultiply, "NumpadMultiply"),
            (Key::KpDivide, "NumpadDivide"),
            (Key::KpDelete, "NumpadDecimal"),
            (Key::KpReturn, "NumpadEnter"),
        ];

        for (key, expected) in cases {
            assert_eq!(
                key_to_code(&key),
                Some(expected),
                "unexpected browser code for {key:?}"
            );
        }

        assert_eq!(key_to_code(&Key::Unknown(1)), None);
    }

    #[test]
    fn listener_start_is_idempotent() {
        let state = KeyboardListenerState::default();

        assert!(state.claim_start());
        assert!(!state.claim_start());
        state.release();
        assert!(state.claim_start());
    }

    #[test]
    fn listener_error_releases_the_start_claim() {
        let state = KeyboardListenerState::default();
        assert!(state.claim_start());

        assert_eq!(
            state.listener_error(),
            KeyboardStatus::fallback("listener-error")
        );
        assert!(state.claim_start());
    }

    #[test]
    fn keyboard_status_uses_the_frontend_contract() {
        assert_eq!(
            serde_json::to_value(KeyboardStatus::active()).unwrap(),
            json!({ "status": "active", "reason": null })
        );
        assert_eq!(
            serde_json::to_value(KeyboardStatus::fallback("permission-required")).unwrap(),
            json!({ "status": "fallback", "reason": "permission-required" })
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn maps_macos_virtual_keycodes_without_character_translation() {
        use super::macos_keycode_to_code;

        let cases = [
            (0, "KeyA"),
            (18, "Digit1"),
            (36, "Enter"),
            (56, "ShiftLeft"),
            (61, "AltRight"),
            (82, "Numpad0"),
            (123, "ArrowLeft"),
            (126, "ArrowUp"),
        ];

        for (keycode, expected) in cases {
            assert_eq!(macos_keycode_to_code(keycode), Some(expected));
        }
        assert_eq!(macos_keycode_to_code(u16::MAX), None);
    }
}
