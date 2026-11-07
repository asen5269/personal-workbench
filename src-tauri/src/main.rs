#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    fs,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;

struct Backend(Mutex<Option<Child>>);
fn hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
}
fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let payload = dunce::simplified(&app.path().resource_dir()?).join("payload");
            let data = dunce::simplified(&app.path().app_local_data_dir()?).to_path_buf();
            fs::create_dir_all(&data)?;
            let token = uuid::Uuid::new_v4().to_string();
            let ready = data.join(format!("ready-{}.txt", token));
            let log = fs::File::create(data.join("backend.log"))?;
            let runtime = payload.join(if cfg!(windows) { "node.exe" } else { "node" });
            let mut command = Command::new(runtime);
            command
                .arg(payload.join("desktop/server-bootstrap.js"))
                .current_dir(&payload)
                .env("WORKBENCH_DESKTOP", "1")
                .env("WORKBENCH_DATA_DIR", &data)
                .env("WORKBENCH_SESSION_TOKEN", &token)
                .env("WORKBENCH_READY_FILE", &ready)
                .stdout(Stdio::from(log.try_clone()?))
                .stderr(Stdio::from(log));
            hidden(&mut command);
            let mut child = command.spawn()?;
            let start = Instant::now();
            let address = loop {
                if let Ok(address) = fs::read_to_string(&ready) {
                    let _ = fs::remove_file(&ready);
                    break address;
                }
                if child.try_wait()?.is_some() {
                    return Err("后台启动失败，请查看应用数据目录 backend.log".into());
                }
                if start.elapsed() > Duration::from_secs(90) {
                    let _ = child.kill();
                    return Err("后台启动超时".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            };
            app.manage(Backend(Mutex::new(Some(child))));
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(
                    format!("{}/__desktop/start?token={}", address, token).parse()?,
                ),
            )
            .title("个人工作台")
            .inner_size(1360.0, 900.0)
            .min_inner_size(900.0, 640.0)
            .initialization_script("window.__WORKBENCH_DESKTOP__=true;")
            .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("无法启动个人工作台");
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<Backend>() {
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(mut child) = guard.take() {
                        #[cfg(windows)]
                        {
                            let mut c = Command::new("taskkill");
                            c.args(["/PID", &child.id().to_string(), "/T", "/F"]);
                            hidden(&mut c);
                            let _ = c.output();
                        }
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        }
    });
}
