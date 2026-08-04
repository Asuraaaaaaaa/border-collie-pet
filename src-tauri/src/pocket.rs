use std::path::Path;

fn validate_pocket_target<'a>(target: &'a str, kind: &str) -> Result<&'a str, String> {
    match kind {
        "file" => {
            if target.is_empty() || target.contains('\0') {
                return Err("无效的文件路径".into());
            }
            if !Path::new(target).exists() {
                return Err("文件已移动或删除".into());
            }
            Ok(target)
        }
        "url" => {
            let target = target.trim();
            if target.is_empty() || target.chars().any(char::is_control) {
                return Err("无效的打开目标".into());
            }
            let lower = target.to_ascii_lowercase();
            if !lower.starts_with("http://") && !lower.starts_with("https://") {
                return Err("只能打开 HTTP(S) 链接".into());
            }
            Ok(target)
        }
        _ => return Err("不支持的打开目标类型".into()),
    }
}

#[tauri::command]
pub fn open_pocket_target(target: String, kind: String) -> Result<(), String> {
    let target = validate_pocket_target(&target, &kind)?;
    open::that_detached(target).map_err(|error| format!("打开失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::validate_pocket_target;

    #[test]
    fn accepts_http_links_and_existing_paths() {
        assert!(validate_pocket_target("https://example.com/path", "url").is_ok());
        assert!(validate_pocket_target(env!("CARGO_MANIFEST_DIR"), "file").is_ok());
    }

    #[test]
    fn rejects_unsafe_or_missing_targets() {
        assert!(validate_pocket_target("javascript:alert(1)", "url").is_err());
        assert!(validate_pocket_target("https://example.com\ninvalid", "url").is_err());
        assert!(validate_pocket_target("/this/path/does/not/exist", "file").is_err());
        assert!(validate_pocket_target("hello", "text").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn preserves_valid_file_paths_with_trailing_whitespace() {
        let path = std::env::temp_dir().join(format!(
            "line-puppy-pocket-{} \n",
            std::process::id()
        ));
        std::fs::write(&path, b"pocket test").unwrap();
        let target = path.to_string_lossy().into_owned();

        assert_eq!(validate_pocket_target(&target, "file").unwrap(), target);

        std::fs::remove_file(path).unwrap();
    }
}
