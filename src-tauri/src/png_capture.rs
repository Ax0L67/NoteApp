fn valid_region(x:f64,y:f64,width:f64,height:f64)->bool {
    [x,y,width,height].iter().all(|n|n.is_finite()) && x>=0. && y>=0. && width>=1. && height>=1. && width<=16384. && height<=16384. && width*height<=64_000_000.
}
#[tauri::command]
pub async fn capture_png_region(window: tauri::WebviewWindow, x: f64, y: f64, width: f64, height: f64) -> Result<String,String> {
    if !valid_region(x,y,width,height) {
        return Err("Invalid capture region".into());
    }
    #[cfg(windows)]
    {
        use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
        use windows::core::{w,HSTRING,PCWSTR};
        let (tx,rx)=std::sync::mpsc::channel();
        let params=serde_json::json!({"format":"png","clip":{"x":x,"y":y,"width":width,"height":height,"scale":1},"captureBeyondViewport":false}).to_string();
        window.with_webview(move |view| unsafe {
            let complete=tx.clone();
            let handler=CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result,json| {
                let response=result.map_err(|e|e.to_string()).and_then(|_|serde_json::from_str::<serde_json::Value>(&json).map_err(|e|e.to_string()))
                    .and_then(|value|value["data"].as_str().filter(|data|data.len()<256*1024*1024).map(String::from).ok_or("No PNG returned".into()));
                let _=complete.send(response);Ok(())
            }));
            let params=HSTRING::from(params);
            let result=view.controller().CoreWebView2().and_then(|core|core.CallDevToolsProtocolMethod(w!("Page.captureScreenshot"),PCWSTR(params.as_ptr()),&handler));
            if let Err(error)=result {let _=tx.send(Err(error.to_string()));}
        }).map_err(|e|e.to_string())?;
        return tauri::async_runtime::spawn_blocking(move ||rx.recv_timeout(std::time::Duration::from_secs(15)).map_err(|e|e.to_string())?).await.map_err(|e|e.to_string())?;
    }
    #[cfg(not(windows))]
    {let _=window;Err("Native PNG capture is currently supported on Windows".into())}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_or_excessive_capture_regions() {
        assert!(valid_region(0.,20.,1920.,1080.));
        assert!(!valid_region(f64::NAN,0.,100.,100.));
        assert!(!valid_region(-1.,0.,100.,100.));
        assert!(!valid_region(0.,0.,0.,100.));
        assert!(!valid_region(0.,0.,16384.,16384.));
    }
}
