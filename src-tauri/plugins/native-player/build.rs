const COMMANDS: &[&str] = &[
    "play",
    "pause",
    "resume",
    "stop",
    "update_metadata",
    "set_volume",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
