use serde_json::{json, Value};
use std::{sync::Mutex, time::{Duration, Instant}};

#[derive(Default)]
pub struct CodeRuns(Mutex<Option<(String, Instant)>>);

impl CodeRuns {
    fn reserve(&self, id: &str, language: &str, code: &str, stdin: &str) -> Result<(), String> {
        if id.len() != 36 || !id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
            return Err("Некорректный идентификатор запуска".into());
        }
        if !matches!(language, "python" | "cpp") || code.len() > 128 * 1024 || stdin.len() > 64 * 1024 {
            return Err("Недопустимый язык или превышен размер входных данных".into());
        }
        let mut lease = self.0.lock().map_err(|_| "Не удалось проверить активный запуск")?;
        if lease.as_ref().is_some_and(|(_, started)| started.elapsed() < Duration::from_secs(75)) {
            return Err("Другая программа уже выполняется. Остановите её перед запуском новой.".into());
        }
        *lease = Some((id.into(), Instant::now()));
        Ok(())
    }
}

#[tauri::command]
pub fn prepare_code_run(state: tauri::State<'_, CodeRuns>, run_id: String, language: String, code: String, stdin: String) -> Result<(), String> {
    state.reserve(&run_id, &language, &code, &stdin)
}

#[tauri::command]
pub fn release_code_run(state: tauri::State<'_, CodeRuns>, run_id: String) -> Result<(), String> {
    let mut lease = state.0.lock().map_err(|_| "Не удалось освободить запуск")?;
    if lease.as_ref().is_some_and(|(id, _)| id == &run_id) { *lease = None; }
    Ok(())
}

// A separate protocol keeps permissive Wasm/eval rules out of the main app CSP.
pub fn sandbox_response(path: &str) -> tauri::http::Response<Vec<u8>> {
    let allowed = path == "/sandbox";
    tauri::http::Response::builder().status(if allowed { 200 } else { 404 })
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        .header("X-Content-Type-Options", "nosniff")
        .body(if allowed { include_bytes!("../../public/code-runtime/sandbox.html").to_vec() } else { Vec::new() })
        .expect("static sandbox response")
}

// The client also fails closed on missing assets or a failed opaque-origin handshake.
#[tauri::command]
pub fn code_runtime_status() -> Value {
    json!({"available": true, "reason": "Локальная WebAssembly-среда. Сеть и файлы компьютера недоступны. Лимит: 10 с, вывод 1 МиБ."})
}

fn valid_file_name(file_name: &str, language: &str) -> bool {
    let extension = match language { "python" => ".py", "cpp" => ".cpp", _ => return false };
    !file_name.starts_with('.') && file_name.chars().count() <= 80
        && file_name.ends_with(extension)
        && file_name.chars().all(|c| c.is_alphanumeric() || "_ .-".contains(c))
}

#[tauri::command]
pub async fn save_code_file(code: String, file_name: String, language: String) -> Result<bool, String> {
    if code.len() > 128 * 1024 { return Err("Размер кода превышает 128 КиБ".into()); }
    if !valid_file_name(&file_name, &language) { return Err("Недопустимое имя файла программы".into()); }
    // The destination always comes from the native save dialog, never from the note.
    let destination = rfd::FileDialog::new().set_title("Сохранить код")
        .set_file_name(&file_name).save_file();
    if let Some(path) = destination {
        noteapp_vault::atomic_write(&path, code.as_bytes())?;
        return Ok(true);
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sandbox_has_no_network_and_serves_only_its_bootstrap() {
        let response = sandbox_response("/sandbox");
        assert_eq!(response.status(), 200);
        assert!(response.headers()["Content-Security-Policy"].to_str().unwrap().contains("connect-src 'none'"));
        assert_eq!(sandbox_response("/../../secret").status(), 404);
    }
    #[test]
    fn reserves_only_one_run_and_rejects_invalid_input() {
        let state = CodeRuns::default();
        let id = "12345678-1234-1234-1234-123456789abc";
        assert!(state.reserve(id, "python", "print(1)", "").is_ok());
        assert!(state.reserve(id, "cpp", "int main() {}", "").is_err());
        let empty = CodeRuns::default();
        assert!(empty.reserve(id, "shell", "", "").is_err());
        assert!(empty.reserve(id, "python", &"x".repeat(128 * 1024 + 1), "").is_err());
        assert!(empty.reserve(id, "python", "", &"x".repeat(64 * 1024 + 1)).is_err());
    }
    #[test]
    fn rejects_paths_and_unexpected_extensions() {
        assert!(valid_file_name("main.cpp", "cpp"));
        assert!(valid_file_name("задача.py", "python"));
        for name in ["../main.py", "C:\\main.py", "main.py.exe", "main.py:stream", ".py"] {
            assert!(!valid_file_name(name, "python"));
        }
        assert!(!valid_file_name("main.py", "shell"));
    }
}
