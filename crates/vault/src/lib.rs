use std::{fs::{self,File},io::Write,path::{Path,PathBuf,Component},time::{SystemTime,UNIX_EPOCH}};
use serde_json::{Value,json};
use sha2::{Sha256,Digest};
use fs2::FileExt;
use base64::Engine;
type R<T> = Result<T,String>;
fn err(e:impl std::fmt::Display)->String {e.to_string()}
pub fn atomic_write(path:&Path,bytes:&[u8])->R<()> {
    let parent=path.parent().ok_or("Нет родительской папки")?;
    fs::create_dir_all(parent).map_err(err)?;
    let mut temp=tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    temp.write_all(bytes).map_err(err)?;temp.as_file().sync_all().map_err(err)?;
    temp.persist(path).map_err(err)?;
    #[cfg(unix)] File::open(parent).and_then(|f|f.sync_all()).map_err(err)?;
    Ok(())
}
fn hash(s:&str)->String {format!("{:x}",Sha256::digest(s.as_bytes()))}
fn stamp()->String {SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos().to_string()}
fn rebase_markdown(content:&str,from:&str,to:&str)->String {
    let from_dir=from.rsplit_once('/').map(|p|p.0).unwrap_or("");let to_dir=to.rsplit_once('/').map(|p|p.0).unwrap_or("");
    if from_dir==to_dir{return content.into()}
    let re=regex::Regex::new(r"(!?\[[^\]]*\]\()([^\s)]+)(\))").unwrap();
    re.replace_all(content,|c:&regex::Captures|{
        let href=&c[2];if href.contains(':')||href.starts_with('#')||href.starts_with('/') {return c[0].into()}
        let mut parts:Vec<&str>=from_dir.split('/').filter(|s|!s.is_empty()).collect();
        for p in href.split('/') {if p==".." {parts.pop();}else if p!="."&&!p.is_empty(){parts.push(p)}}
        let dest:Vec<&str>=to_dir.split('/').filter(|s|!s.is_empty()).collect();let common=dest.iter().zip(parts.iter()).take_while(|(a,b)|a==b).count();
        format!("{}{}{}{}",&c[1],"../".repeat(dest.len()-common),parts[common..].join("/"),&c[3])
    }).into_owned()
}
fn decode_segment(segment:&str)->Option<String> {
    let input=segment.as_bytes();let mut out=Vec::with_capacity(input.len());let mut i=0;
    while i<input.len(){
        if input[i]==b'%' {if i+2>=input.len(){return None}let digit=|v:u8|(v as char).to_digit(16);
            let byte=(digit(input[i+1])?*16+digit(input[i+2])?) as u8;if byte==b'/'||byte==b'\\'{return None}out.push(byte);i+=3;
        }else{out.push(input[i]);i+=1;}
    }
    String::from_utf8(out).ok()
}
fn encode_segment(segment:&str)->String {
    let mut out=String::new();
    for byte in segment.bytes(){if byte.is_ascii_alphanumeric()||b"-_.~".contains(&byte){out.push(byte as char)}else{out.push_str(&format!("%{byte:02X}"))}}
    out
}
fn rebase_folder_links(content:&str,old_note:&str,new_note:&str,from:&str,to:&str)->String {
    let old_dir:Vec<&str>=old_note.rsplit_once('/').map(|p|p.0).unwrap_or("").split('/').filter(|s|!s.is_empty()).collect();
    let new_dir:Vec<&str>=new_note.rsplit_once('/').map(|p|p.0).unwrap_or("").split('/').filter(|s|!s.is_empty()).collect();
    let source:Vec<&str>=from.split('/').collect();let target:Vec<&str>=to.split('/').collect();
    let re=regex::Regex::new(r"(!?\[[^\]]*\]\()([^\s)]+)(\))").unwrap();
    re.replace_all(content,|c:&regex::Captures|{
        let href=&c[2];if href.contains(':')||href.starts_with('#')||href.starts_with('/') {return c[0].to_string()}
        let split=href.find(['#','?']).unwrap_or(href.len());let (path,suffix)=href.split_at(split);
        let mut parts:Vec<String>=old_dir.iter().map(|s|s.to_string()).collect();
        for part in path.split('/') {let Some(part)=decode_segment(part) else{return c[0].to_string()};
            if part==".." {if parts.pop().is_none(){return c[0].to_string()}}else if part!="."&&!part.is_empty(){parts.push(part)}
        }
        let moved=parts.len()>=source.len()&&parts.iter().zip(source.iter()).all(|(a,b)|a.as_str()==*b);
        if moved {parts.splice(..source.len(),target.iter().map(|part|part.to_string()));}
        if old_note==new_note&&!moved{return c[0].to_string()}
        let common=new_dir.iter().zip(parts.iter()).take_while(|pair|*pair.0==pair.1.as_str()).count();
        let relative=format!("{}{}","../".repeat(new_dir.len()-common),parts[common..].iter().map(|p|encode_segment(p)).collect::<Vec<_>>().join("/"));
        format!("{}{}{}{}",&c[1],if relative.is_empty(){"."}else{&relative},suffix,&c[3])
    }).into_owned()
}
fn str_arg<'a>(a:&'a Value,k:&str)->R<&'a str>{a[k].as_str().ok_or(format!("Нет поля {k}"))}
pub struct Vault {pub root:PathBuf,_lock:File}
impl Vault {
    pub fn file_bytes(&self,rel:&str)->R<Vec<u8>> {fs::read(self.path(rel)?).map_err(err)}
    pub fn open(root:PathBuf)->R<Self>{
        fs::create_dir_all(root.join(".noteapp")).map_err(err)?;
        let root=root.canonicalize().map_err(err)?;
        let lock=fs::OpenOptions::new().create(true).truncate(false).write(true).open(root.join(".noteapp/lock")).map_err(err)?;
        lock.try_lock_exclusive().map_err(|_|"Это хранилище уже открыто в другом экземпляре NoteApp".to_string())?;
        let v=Self{root,_lock:lock};v.recover()?;Ok(v)
    }
    fn path(&self,rel:&str)->R<PathBuf>{
        if rel.is_empty() || rel.contains('\\') || Path::new(rel).components().any(|c|!matches!(c,Component::Normal(_))) {return Err("Недопустимый путь".into())}
        let mut p=self.root.clone();
        for part in Path::new(rel).components(){p.push(part);if let Ok(m)=fs::symlink_metadata(&p){if m.file_type().is_symlink(){return Err("Символические ссылки не поддерживаются".into())}}}
        Ok(p)
    }
    fn note_path(&self,rel:&str)->R<PathBuf>{
        if rel.starts_with('.') || rel.split('/').any(|p|p.starts_with('.')) || !rel.to_lowercase().ends_with(".md"){return Err("Ожидается Markdown-файл внутри хранилища".into())} self.path(rel)
    }
    fn walk(&self,dir:&Path,out:&mut Vec<Value>)->R<()>{
        let mut entries=fs::read_dir(dir).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;entries.sort_by_key(|e|e.file_name());
        for entry in entries {let p=entry.path();let m=entry.file_type().map_err(err)?;
            if m.is_symlink() || entry.file_name().to_string_lossy().starts_with('.') {continue}
            if m.is_dir(){self.walk(&p,out)?} else if p.extension().map(|s|s.eq_ignore_ascii_case("md")).unwrap_or(false){
                let content=fs::read_to_string(&p).map_err(err)?;out.push(json!({"path":p.strip_prefix(&self.root).map_err(err)?.to_string_lossy().replace('\\',"/"),"content":content,"revision":hash(&content)}));
            }
        } Ok(())
    }
    fn folders(&self,dir:&Path,out:&mut Vec<String>)->R<()>{
        for e in fs::read_dir(dir).map_err(err)? {let e=e.map_err(err)?;if e.file_type().map_err(err)?.is_dir()&&!e.file_name().to_string_lossy().starts_with('.') {out.push(e.path().strip_prefix(&self.root).map_err(err)?.to_string_lossy().replace('\\',"/"));self.folders(&e.path(),out)?}}Ok(())
    }
    pub fn snapshot(&self)->R<Value>{
        let mut notes=vec![];self.walk(&self.root,&mut notes)?;let mut folders=vec![];self.folders(&self.root,&mut folders)?;folders.sort();
        let settings=fs::read_to_string(self.root.join(".noteapp/settings.json")).ok().and_then(|s|serde_json::from_str::<Value>(&s).ok()).unwrap_or(json!({}));
        let mut trash=vec![];let trashdir=self.root.join(".noteapp/trash");
        if trashdir.exists(){for e in fs::read_dir(&trashdir).map_err(err)? {let p=e.map_err(err)?.path();if p.extension().and_then(|s|s.to_str())==Some("json") {if let Ok(s)=fs::read_to_string(&p){if let Ok(j)=serde_json::from_str::<Value>(&s){
            if j["kind"]!="folder" || p.with_extension("folder").is_dir(){trash.push(j)}
        }}}}}
        let mut templates=vec![];let dir=self.root.join(".noteapp/templates");
        if dir.exists(){for e in fs::read_dir(dir).map_err(err)?{let p=e.map_err(err)?.path();if p.extension().and_then(|s|s.to_str())==Some("md"){templates.push(json!({"name":p.file_stem().unwrap().to_string_lossy(),"content":fs::read_to_string(&p).map_err(err)?}))}}}
        Ok(json!({"root":self.root.to_string_lossy(),"name":self.root.file_name().unwrap_or_default().to_string_lossy(),"notes":notes,"folders":folders,"settings":settings,"trash":trash,"templates":templates}))
    }
    fn save(&self,path:&str,content:&str,revision:Option<&str>)->R<Value>{
        let p=self.note_path(path)?;let old=if p.exists(){Some(fs::read_to_string(&p).map_err(err)?)}else{None};
        if old.as_deref().map(hash).as_deref()!=revision {return Ok(json!({"conflict":true,"content":old,"revision":old.as_deref().map(hash)}))}
        atomic_write(&p,content.as_bytes())?;Ok(json!({"revision":hash(content)}))
    }
    fn recover(&self)->R<()>{
        let journal=self.root.join(".noteapp/transaction.json");if !journal.exists(){return Ok(())}
        let transaction:Value=serde_json::from_slice(&fs::read(&journal).map_err(err)?).map_err(err)?;
        if transaction["kind"]=="move_folder"{return self.recover_folder_move(&journal,&transaction)}
        let items:Vec<Value>=serde_json::from_value(transaction).map_err(err)?;
        // Finish interrupted transactions only if files still match either recorded version.
        for i in &items {let p=self.note_path(str_arg(i,"path")?)?;let actual=fs::read_to_string(&p).ok();
            if actual.as_deref()!=i["before"].as_str()&&actual.as_deref()!=i["after"].as_str(){return Err(format!("Незавершённая операция: файл {} изменён извне. Сохраните его копию и восстановите .noteapp/transaction.json вручную.",str_arg(i,"path")?))}}
        for i in items{let p=self.note_path(str_arg(&i,"path")?)?;if let Some(s)=i["after"].as_str(){atomic_write(&p,s.as_bytes())?}else if p.exists(){fs::remove_file(p).map_err(err)?}}
        fs::remove_file(journal).map_err(err)?;Ok(())
    }
    fn recover_folder_move(&self,journal:&Path,transaction:&Value)->R<()> {
        let source=self.user_folder_path(str_arg(transaction,"from")?)?;
        let target=self.user_folder_path(str_arg(transaction,"to")?)?;
        let before_move=source.is_dir()&&!target.exists();
        if !before_move&&(source.exists()||!target.is_dir()) {return Err("Незавершённое перемещение папки: проверьте исходный и конечный пути.".into())}
        let items=transaction["changes"].as_array().ok_or("Повреждён журнал перемещения")?;
        for item in items {
            let path=if before_move{str_arg(item,"old_path")?}else{str_arg(item,"path")?};
            let actual=fs::read_to_string(self.note_path(path)?).map_err(err)?;
            if Some(actual.as_str())!=item["before"].as_str()&&(!(!before_move&&Some(actual.as_str())==item["after"].as_str())) {
                return Err(format!("Незавершённое перемещение: файл {path} изменён извне. Сохраните копию и восстановите журнал вручную."));
            }
        }
        if before_move {if let Err(error)=fs::rename(&source,&target){fs::remove_file(journal).map_err(err)?;return Err(err(error))}}
        for item in items {
            let path=self.note_path(str_arg(item,"path")?)?;let after=str_arg(item,"after")?;
            if fs::read_to_string(&path).map_err(err)?!=after {atomic_write(&path,after.as_bytes())?;}
        }
        fs::remove_file(journal).map_err(err)?;Ok(())
    }
    fn rename(&self,from:&str,to:&str,revision:&str)->R<Value>{
        let src=self.note_path(from)?;let dest=self.note_path(to)?;
        if from==to{return self.snapshot()}
        if dest.exists(){return Err("Заметка с таким именем уже существует".into())}
        let content=fs::read_to_string(&src).map_err(err)?;if hash(&content)!=revision{return Err("Заметка изменилась извне. Сначала обновите её.".into())}
        let old=Path::new(from).file_stem().unwrap().to_string_lossy().to_string();
        let new=to.trim_end_matches(".md"); // Qualified targets remain unambiguous.
        let mut notes=vec![];self.walk(&self.root,&mut notes)?;
        let ambiguous=notes.iter().filter(|n|Path::new(n["path"].as_str().unwrap()).file_stem().unwrap().to_string_lossy()==old).count()>1;
        let reference = |path:&str| format!("](noteapp-note:{})",base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(path));
        let old_reference=reference(from);let new_reference=reference(to);
        let re=regex::Regex::new(r"\[\[([^\]|#]+)([^\]]*)\]\]").unwrap();let mut changes=vec![];
        for n in notes {let path=n["path"].as_str().unwrap();let before=n["content"].as_str().unwrap();
            let after=re.replace_all(before,|c:&regex::Captures|{if c[1]==*from.trim_end_matches(".md")||(!ambiguous&&c[1]==old){format!("[[{}{}]]",new,&c[2])}else{c[0].to_string()}}).replace(old_reference.as_str(),&new_reference);
            if path==from {let after=rebase_markdown(&after,from,to);changes.push(json!({"path":to,"before":null,"after":after}));changes.push(json!({"path":from,"before":before,"after":null}));}
            else if after!=before {changes.push(json!({"path":path,"before":before,"after":after}));}
        }
        atomic_write(&self.root.join(".noteapp/transaction.json"),&serde_json::to_vec(&changes).map_err(err)?)?;self.recover()?;self.snapshot()
    }
    fn user_folder_path(&self, path: &str) -> R<PathBuf> {
        if path.split('/').any(|part| part.is_empty() || part.starts_with('.') || part.ends_with(['.', ' ']))
            || path.split('/').next().is_some_and(|part| part.eq_ignore_ascii_case("attachments")) {
            return Err("Недопустимый путь папки".into());
        }
        self.path(path)
    }

    fn move_folder(&self,from:&str,to:&str)->R<Value> {
        let requested=self.user_folder_path(from)?;let target=self.user_folder_path(to)?;
        if !requested.is_dir(){return Err("Папка уже отсутствует в хранилище".into())}
        let mut folders=vec![];self.folders(&self.root,&mut folders)?;
        let actual=folders.iter().find(|p|p.as_str()==from).or_else(||if cfg!(windows){folders.iter().find(|p|p.to_lowercase()==from.to_lowercase())}else{None});
        let from=actual.ok_or("Папка уже отсутствует в хранилище")?.as_str();
        let source=self.user_folder_path(from)?;
        if from==to{return self.snapshot()}
        if fs::symlink_metadata(&target).is_ok(){return Err("По этому пути уже есть файл или папка".into())}
        if to.split('/').any(|part|part.chars().any(|c|c.is_control()||"<>:\"\\|?*".contains(c))||{
            let stem=part.split('.').next().unwrap_or("").to_ascii_uppercase();
            ["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"].contains(&stem.as_str())
        }){return Err("Недопустимое имя папки".into())}
        let from_lower=from.to_lowercase();let to_lower=to.to_lowercase();
        if to_lower==from_lower||to_lower.starts_with(&(from_lower+"/")){return Err("Нельзя переместить папку внутрь неё самой".into())}
        let parent=target.parent().ok_or("Нет родительской папки")?;
        if !parent.is_dir(){return Err("Папка назначения отсутствует".into())}
        if parent.canonicalize().map_err(err)?.starts_with(source.canonicalize().map_err(err)?){return Err("Нельзя переместить папку внутрь неё самой".into())}
        let mut notes=vec![];self.walk(&self.root,&mut notes)?;
        let prefix=format!("{from}/");
        let moved:Vec<(String,String,String,bool)>=notes.iter().filter_map(|note|{
            let path=note["path"].as_str()?;let suffix=path.strip_prefix(&prefix)?;
            let stem=Path::new(path).file_stem()?.to_string_lossy().to_string();
            let unique=notes.iter().filter(|n|Path::new(n["path"].as_str().unwrap_or("")).file_stem().is_some_and(|s|s.to_string_lossy().as_ref()==stem.as_str())).count()==1;
            Some((path.to_string(),format!("{to}/{suffix}"),stem,unique))
        }).collect();
        let wiki=regex::Regex::new(r"\[\[([^\]|#]+)([^\]]*)\]\]").unwrap();let mut changes=vec![];
        for note in notes {
            let old_path=note["path"].as_str().unwrap();let before=note["content"].as_str().unwrap();
            let path=moved.iter().find(|(old,_,_,_)|old.as_str()==old_path).map(|(_,new,_,_)|new.as_str()).unwrap_or(old_path);
            let after=wiki.replace_all(before,|c:&regex::Captures|{
                let found=moved.iter().find(|(old,_,_,_)|&c[1]==&old[..old.len()-3])
                    .or_else(||moved.iter().find(|(_,_,stem,unique)|*unique&&&c[1]==stem.as_str()));
                found.map(|(_,new,_,_)|format!("[[{}{}]]",&new[..new.len()-3],&c[2])).unwrap_or_else(||c[0].to_string())
            }).into_owned();
            let after=moved.iter().fold(after,|text,(old,new,_,_)|{
                let encoded=|path:&str|format!("](noteapp-note:{})",base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(path));
                text.replace(&encoded(old),&encoded(new))
            });
            let after=rebase_folder_links(&after,old_path,path,from,to);
            if old_path!=path||after!=before {changes.push(json!({"old_path":old_path,"path":path,"before":before,"after":after}));}
        }
        let transaction=json!({"kind":"move_folder","from":from,"to":to,"changes":changes});
        atomic_write(&self.root.join(".noteapp/transaction.json"),&serde_json::to_vec(&transaction).map_err(err)?)?;
        self.recover()?;self.snapshot()
    }

    fn trash_folder(&self, path: &str) -> R<Value> {
        let source = self.user_folder_path(path)?;
        if !source.is_dir() { return Err("Папка уже отсутствует в хранилище".into()); }
        let trash = self.root.join(".noteapp/trash");
        fs::create_dir_all(&trash).map_err(err)?;
        let id = stamp();
        let meta = trash.join(format!("{id}.json"));
        let contents = trash.join(format!("{id}.folder"));
        atomic_write(&meta, &serde_json::to_vec(&json!({"id": id, "path": path, "kind": "folder"})).map_err(err)?)?;
        if let Err(error) = fs::rename(source, contents) {
            let _ = fs::remove_file(meta);
            return Err(err(error));
        }
        self.snapshot()
    }

    fn restore_folder(&self, meta: PathBuf, path: &str) -> R<Value> {
        let target = self.user_folder_path(path)?;
        if fs::symlink_metadata(&target).is_ok() {
            return Err("Папка с таким именем уже существует. Сначала переименуйте или переместите её.".into());
        }
        if !target.parent().is_some_and(Path::is_dir) {
            return Err("Сначала восстановите родительскую папку.".into());
        }
        fs::rename(meta.with_extension("folder"), target).map_err(err)?;
        fs::remove_file(meta).map_err(err)?;
        self.snapshot()
    }

    pub fn dispatch(&self,op:&str,a:Value)->R<Value>{
        self.recover()?;
        match op {
            "snapshot"=>self.snapshot(),
            "save"=>self.save(str_arg(&a,"path")?,str_arg(&a,"content")?,a["revision"].as_str()),
            "rename"=>self.rename(str_arg(&a,"path")?,str_arg(&a,"to")?,str_arg(&a,"revision")?),
            "folder"=>{fs::create_dir_all(self.user_folder_path(str_arg(&a,"path")?)?).map_err(err)?;self.snapshot()},
            "move_folder"=>self.move_folder(str_arg(&a,"from")?,str_arg(&a,"to")?),
            "trash_folder"=>self.trash_folder(str_arg(&a,"path")?),
            "trash"=>{let path=str_arg(&a,"path")?;let p=self.note_path(path)?;let content=fs::read_to_string(&p).map_err(err)?;
                if hash(&content)!=str_arg(&a,"revision")?{return Err("Заметка изменена извне — удаление отменено".into())}
                let id=stamp();let dir=self.root.join(".noteapp/trash");fs::create_dir_all(&dir).map_err(err)?;
                atomic_write(&dir.join(format!("{id}.md")),content.as_bytes())?;
                atomic_write(&dir.join(format!("{id}.json")),&serde_json::to_vec(&json!({"id":id,"path":path})).map_err(err)?)?;
                fs::remove_file(p).map_err(err)?;self.snapshot()},
            "restore"=>{let id=str_arg(&a,"id")?;if id.is_empty()||!id.chars().all(|c|c.is_ascii_digit()){return Err("Некорректный идентификатор".into())}
                let meta=self.root.join(format!(".noteapp/trash/{id}.json"));let item:Value=serde_json::from_slice(&fs::read(&meta).map_err(err)?).map_err(err)?;
                let orig=str_arg(&item,"path")?;if item["kind"]=="folder"{return self.restore_folder(meta,orig)}let mut dest=self.note_path(orig)?;
                if dest.exists(){dest=self.note_path(&format!("{} (восстановлено {}).md",orig.trim_end_matches(".md"),stamp()))?}
                let data=self.root.join(format!(".noteapp/trash/{id}.md"));atomic_write(&dest,&fs::read(&data).map_err(err)?)?;fs::remove_file(meta).map_err(err)?;fs::remove_file(data).map_err(err)?;self.snapshot()},
            "settings"=>{atomic_write(&self.root.join(".noteapp/settings.json"),&serde_json::to_vec(&a).map_err(err)?)?;Ok(json!(true))},
            "template"=>{let name=str_arg(&a,"name")?;if name.is_empty()||name.contains(['/', '\\', ':'])||name.starts_with('.') {return Err("Некорректное имя шаблона".into())}atomic_write(&self.root.join(format!(".noteapp/templates/{name}.md")),str_arg(&a,"content")?.as_bytes())?;self.snapshot()},
            "attachment"=>{let name=Path::new(str_arg(&a,"name")?).file_name().ok_or("Нет имени")?.to_string_lossy();if name.contains(['\\',':']){return Err("Некорректное имя".into())}let rel=format!("attachments/{}-{}",stamp(),name);let bytes=base64::engine::general_purpose::STANDARD.decode(str_arg(&a,"data")?).map_err(err)?;atomic_write(&self.path(&rel)?,&bytes)?;Ok(json!({"path":rel}))},
            "asset"=>{let rel=str_arg(&a,"path")?;let p=self.path(rel)?;let ext=p.extension().unwrap_or_default().to_string_lossy().to_lowercase();let mime=match ext.as_str(){"png"=>"image/png","jpg"|"jpeg"=>"image/jpeg","webp"=>"image/webp","gif"=>"image/gif","avif"=>"image/avif",_=>return Err("Формат изображения не поддерживается".into())};let bytes=fs::read(p).map_err(err)?;Ok(json!(format!("data:{mime};base64,{}",base64::engine::general_purpose::STANDARD.encode(bytes))))},
            _=>Err("Неизвестная команда".into())
        }
    }
    pub fn export_folder(&self,dest:&Path)->R<PathBuf>{
        let canonical=dest.canonicalize().map_err(err)?;if canonical.starts_with(&self.root){return Err("Выберите папку за пределами хранилища".into())}
        let out=canonical.join(format!("NoteApp-backup-{}",stamp()));copy_tree(&self.root,&out,true)?;Ok(out)
    }
    pub fn import_folder(&self,source:&Path)->R<()> {
        let src=source.canonicalize().map_err(err)?;if src.starts_with(&self.root)||self.root.starts_with(&src){return Err("Нельзя импортировать хранилище само в себя".into())}
        // Import as an isolated folder: existing files are never overwritten, relative attachments survive.
        let dest=self.root.join(format!("Импорт-{}",stamp()));copy_tree(&src,&dest,false)
    }
}
fn copy_tree(src:&Path,dst:&Path,metadata:bool)->R<()> {
    fs::create_dir_all(dst).map_err(err)?;
    for e in fs::read_dir(src).map_err(err)? {let e=e.map_err(err)?;let name=e.file_name();let s=name.to_string_lossy();let ft=e.file_type().map_err(err)?;
        if ft.is_symlink()||s=="lock"||s=="transaction.json"||(!metadata&&s.starts_with('.')) {continue}
        if ft.is_dir(){copy_tree(&e.path(),&dst.join(name),metadata)?}else{atomic_write(&dst.join(name),&fs::read(e.path()).map_err(err)?)?}
    }Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    fn vault()->(tempfile::TempDir,Vault){let d=tempfile::tempdir().unwrap();let v=Vault::open(d.path().join("vault")).unwrap();(d,v)}
    #[test] fn save_restart_conflict(){let (_d,v)=vault();let r=v.save("Заметка.md","# Текст",None).unwrap();assert!(v.save("Заметка.md","wrong",None).unwrap()["conflict"].as_bool().unwrap());let root=v.root.clone();drop(v);let v=Vault::open(root).unwrap();assert_eq!(v.snapshot().unwrap()["notes"][0]["content"],"# Текст");fs::write(v.root.join("Заметка.md"),"external").unwrap();assert_eq!(v.save("Заметка.md","edit",r["revision"].as_str()).unwrap()["content"],"external");}
    #[test] fn rename_links_and_restore(){let (_d,v)=vault();let r=v.save("A.md","hello",None).unwrap();v.save("B.md","[[A]] [[A|alias]] [[A#section]]",None).unwrap();v.rename("A.md","Папка/C.md",r["revision"].as_str().unwrap()).unwrap();assert_eq!(fs::read_to_string(v.root.join("B.md")).unwrap(),"[[Папка/C]] [[Папка/C|alias]] [[Папка/C#section]]");v.dispatch("trash",json!({"path":"Папка/C.md","revision":hash("hello")})).unwrap();let s=v.snapshot().unwrap();v.dispatch("restore",json!({"id":s["trash"][0]["id"]})).unwrap();assert_eq!(fs::read_to_string(v.root.join("Папка/C.md")).unwrap(),"hello");}
    #[test] fn refuses_traversal_and_duplicate(){let (_d,v)=vault();assert!(v.save("../bad.md","x",None).is_err());assert!(v.save(".noteapp/bad.md","x",None).is_err());let r=v.save("A.md","x",None).unwrap();v.save("B.md","y",None).unwrap();assert!(v.rename("A.md","B.md",r["revision"].as_str().unwrap()).is_err());}
    #[test] fn lock_prevents_second_writer(){let (_d,v)=vault();assert!(Vault::open(v.root.clone()).is_err());}
    #[test] fn moving_note_preserves_relative_attachments(){let (_d,v)=vault();let r=v.save("A.md","![image](attachments/pic.png) [web](https://example.org)",None).unwrap();v.rename("A.md","Folder/A.md",r["revision"].as_str().unwrap()).unwrap();assert_eq!(fs::read_to_string(v.root.join("Folder/A.md")).unwrap(),"![image](../attachments/pic.png) [web](https://example.org)");}
    #[test] fn restore_never_overwrites_existing_note(){let (_d,v)=vault();let r=v.save("A.md","deleted",None).unwrap();v.dispatch("trash",json!({"path":"A.md","revision":r["revision"]})).unwrap();v.save("A.md","new",None).unwrap();let s=v.snapshot().unwrap();v.dispatch("restore",json!({"id":s["trash"][0]["id"]})).unwrap();assert_eq!(fs::read_to_string(v.root.join("A.md")).unwrap(),"new");assert_eq!(v.snapshot().unwrap()["notes"].as_array().unwrap().len(),2);}
    #[test] fn backup_and_import_keep_attachments(){let (d,v)=vault();v.save("A.md","![x](attachments/x.png)",None).unwrap();atomic_write(&v.root.join("attachments/x.png"),b"image").unwrap();let b=v.export_folder(d.path()).unwrap();assert!(b.join("A.md").exists());v.import_folder(&b).unwrap();assert_eq!(v.snapshot().unwrap()["notes"].as_array().unwrap().len(),2);}
    #[test] fn interrupted_transaction_is_recovered(){let (_d,v)=vault();v.save("A.md","old",None).unwrap();atomic_write(&v.root.join(".noteapp/transaction.json"),br#"[{"path":"A.md","before":"old","after":"new"}]"#).unwrap();let root=v.root.clone();drop(v);let v=Vault::open(root).unwrap();assert_eq!(fs::read_to_string(v.root.join("A.md")).unwrap(),"new");}
    #[test]
    fn folder_trash_restores_nested_files_without_overwriting() {
        let (_temp, vault) = vault();
        let path = "Проект/Папка";
        vault.save("Проект/Папка/Вложенная/Заметка.md", "# Заметка", None).unwrap();
        fs::write(vault.root.join(path).join("Вложенная/данные.bin"), [1, 2, 3]).unwrap();
        let snapshot = vault.dispatch("trash_folder", json!({"path": path})).unwrap();
        assert!(!vault.root.join(path).exists());
        assert_eq!(snapshot["notes"].as_array().unwrap().len(), 0);
        let item = &snapshot["trash"][0];
        assert_eq!(item["kind"], "folder");

        fs::create_dir(vault.root.join(path)).unwrap();
        assert!(vault.dispatch("restore", json!({"id": item["id"]})).is_err());
        fs::remove_dir(vault.root.join(path)).unwrap();
        let restored = vault.dispatch("restore", json!({"id": item["id"]})).unwrap();
        assert_eq!(restored["notes"][0]["content"], "# Заметка");
        assert_eq!(fs::read(vault.root.join(path).join("Вложенная/данные.bin")).unwrap(), [1, 2, 3]);
        assert!(restored["trash"].as_array().unwrap().is_empty());
    }
}
