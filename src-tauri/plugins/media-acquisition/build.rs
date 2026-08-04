const COMMANDS: &[&str] = &[
    "prepare",
    "status",
    "upload",
    "discard",
    "cancel",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
