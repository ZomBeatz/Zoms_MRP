fn main() {
    // Every command the app's page can call. Listing them gives each one a permission of its own,
    // and the window gets exactly these (capabilities/default.json).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "load_plan",
        "save_plan",
        "write_excel",
        "save_download",
        "data_folder",
    ])))
    .expect("failed to run the Tauri build script");
}
