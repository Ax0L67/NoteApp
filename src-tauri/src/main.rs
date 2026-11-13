#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod code_runtime;
mod png_capture;
use noteapp_vault as storage;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use serde_json::{Value,json};
struct AppState(Mutex<Option<storage::Vault>>);
fn same_vault(vault:&storage::Vault,path:&std::path::Path)->bool { path.canonicalize().map(|path|path==vault.root).unwrap_or(false) }
#[tauri::command]
async fn request(app: tauri::AppHandle, state: tauri::State<'_, AppState>, op: String, args: Value) -> Result<Value,String> {
    let mut guard = state.0.lock().map_err(|_| "Хранилище занято")?;
    if op == "init" || op == "choose" {
        let path = if op == "choose" {
            match rfd::FileDialog::new().set_title("Папка хранилища NoteApp").pick_folder() { Some(p)=>p, None=>return Ok(Value::Null) }
        } else {
            let config = app.path().app_config_dir().map_err(|e|e.to_string())?.join("last-vault.txt");
            std::fs::read_to_string(config).ok().map(std::path::PathBuf::from).filter(|p|p.is_dir()).unwrap_or(app.path().document_dir().map_err(|e|e.to_string())?.join("NoteApp"))
        };
        if guard.as_ref().map(|v|same_vault(v,&path)).unwrap_or(false) { return guard.as_ref().unwrap().snapshot(); }
        let vault=storage::Vault::open(path.clone())?;
        let result=vault.snapshot()?;
        let config=app.path().app_config_dir().map_err(|e|e.to_string())?;
        std::fs::create_dir_all(&config).map_err(|e|e.to_string())?;
        storage::atomic_write(&config.join("last-vault.txt"),path.to_string_lossy().as_bytes())?;
        *guard=Some(vault); return Ok(result)
    }
    let v=guard.as_ref().ok_or("Хранилище не открыто")?;
    if op=="choose-source" {
        let file=rfd::FileDialog::new().add_filter("Документы",&["pdf","epub","txt","md","docx","odt","rtf"]).pick_file();
        return Ok(file.map(|path|json!(path.to_string_lossy().into_owned())).unwrap_or(Value::Null))
    }
    if op=="external" {
        let url=args["url"].as_str().ok_or("Нет ссылки")?;
        if !(url.starts_with("https://")||url.starts_with("http://")||url.starts_with("mailto:")){return Err("Недопустимая ссылка".into())}
        app.opener().open_url(url,None::<&str>).map_err(|e|e.to_string())?;return Ok(json!(true))
    }
    if op=="open-source" {
        let rel=args["path"].as_str().ok_or("Нет пути")?;
        let input=std::path::Path::new(rel);
        let path=if input.is_absolute() {
            let path=input.canonicalize().map_err(|e|e.to_string())?;
            if !path.is_file(){return Err("Файл источника не найден".into())}
            path
        } else {
            if rel.split('/').any(|part|part.is_empty()||part.starts_with('.')) {return Err("Недопустимый путь источника".into())}
            v.file_bytes(rel)?;v.root.join(rel)
        };
        let extension=path.extension().and_then(|value|value.to_str()).unwrap_or("").to_ascii_lowercase();
        if !["pdf","epub","txt","md","docx","odt","rtf"].contains(&extension.as_str()) {return Err("Поддерживаются PDF, EPUB, TXT, Markdown, DOCX, ODT и RTF".into())}
        app.opener().open_path(path.to_string_lossy().into_owned(),None::<&str>).map_err(|e|e.to_string())?;return Ok(json!(true))
    }
    if op=="download" {
        let rel=args["path"].as_str().ok_or("Нет пути")?;
        let bytes=v.file_bytes(rel)?;
        let name=std::path::Path::new(rel).file_name().unwrap_or_default().to_string_lossy();
        if let Some(dest)=rfd::FileDialog::new().set_title("Сохранить вложение как").set_file_name(name.as_ref()).save_file(){storage::atomic_write(&dest,&bytes)?;}
        return Ok(json!(true))
    }
    if op=="export" || op=="backup" || op=="import" {
        let title=if op=="import" {"Выберите папку для импорта"} else {"Куда сохранить копию хранилища?"};
        return match rfd::FileDialog::new().set_title(title).pick_folder() {
            Some(path)=>if op=="import" {v.import_folder(&path)?;v.snapshot()} else {Ok(json!({"path":v.export_folder(&path)?.to_string_lossy()}))}, None=>Ok(Value::Null)
        }
    }
    v.dispatch(&op,args)
}
#[tauri::command]
async fn save_note_png(bytes: Vec<u8>, file_name: String) -> Result<bool,String> {
 if bytes.len()>256*1024*1024 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return Err("Invalid PNG".into()); }
 let name=std::path::Path::new(&file_name).file_name().and_then(|n|n.to_str()).filter(|n|n.ends_with(".png")).unwrap_or("note.png");
 if let Some(path)=rfd::FileDialog::new().set_title("Save note as PNG").add_filter("PNG", &["png"]).set_file_name(name).save_file(){storage::atomic_write(&path,&bytes)?;return Ok(true);}
 Ok(false)
}
fn main() {
    tauri::Builder::default().plugin(tauri_plugin_opener::init()).manage(AppState(Mutex::new(None)))
        .manage(code_runtime::CodeRuns::default())
        .register_uri_scheme_protocol("note-code", |_context, request| code_runtime::sandbox_response(request.uri().path()))
        .invoke_handler(tauri::generate_handler![request, save_note_png, png_capture::capture_png_region, code_runtime::code_runtime_status, code_runtime::save_code_file, code_runtime::prepare_code_run, code_runtime::release_code_run])
        .run(tauri::generate_context!()).expect("Не удалось запустить NoteApp");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_the_same_vault_when_its_path_is_not_canonical() {
        let dir=tempfile::tempdir().unwrap();
        let vault=storage::Vault::open(dir.path().to_path_buf()).unwrap();
        assert!(same_vault(&vault,dir.path()));
    }
}
