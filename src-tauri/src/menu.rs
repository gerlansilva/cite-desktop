use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::AppHandle;

pub fn install(app: &AppHandle, language: &str) -> tauri::Result<()> {
    let tet = language == "tet";
    let label = |pt: &'static str, tt: &'static str| if tet { tt } else { pt };
    let is_mac = cfg!(target_os = "macos");

    let home = MenuItem::with_id(
        app,
        "open-home",
        label("Início", "Inísiu"),
        true,
        Some("CmdOrCtrl+Shift+H"),
    )?;
    let open = MenuItem::with_id(
        app,
        "open-library",
        label("Abrir biblioteca", "Loke biblioteka"),
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let quit = PredefinedMenuItem::quit(app, Some(label("Sair do Cite", "Sai husi Cite")))?;
    let close = PredefinedMenuItem::close_window(app, Some(label("Fechar janela", "Taka janela")))?;

    let file_sep = PredefinedMenuItem::separator(app)?;
    let file_items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = if is_mac {
        vec![&home, &open, &file_sep, &close]
    } else {
        vec![&home, &open, &file_sep, &quit]
    };
    let file = Submenu::with_items(app, label("Arquivo", "Arkivu"), true, &file_items)?;

    let undo = PredefinedMenuItem::undo(app, Some(label("Desfazer", "Desfaser")))?;
    let redo = PredefinedMenuItem::redo(app, Some(label("Refazer", "Halo fila fali")))?;
    let edit_sep = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, Some(label("Recortar", "Korta")))?;
    let copy = PredefinedMenuItem::copy(app, Some(label("Copiar", "Kopia")))?;
    let paste = PredefinedMenuItem::paste(app, Some(label("Colar", "Kola")))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(label("Selecionar tudo", "Hili hotu")))?;
    let edit = Submenu::with_items(
        app,
        label("Editar", "Edita"),
        true,
        &[&undo, &redo, &edit_sep, &cut, &copy, &paste, &select_all],
    )?;

    let reload = MenuItem::with_id(
        app,
        "reload",
        label("Recarregar", "Rekarrega"),
        true,
        Some("CmdOrCtrl+R"),
    )?;
    let devtools = MenuItem::with_id(
        app,
        "devtools",
        label("Ferramentas de desenvolvedor", "Ferramenta desenvolvedor"),
        true,
        Some("CmdOrCtrl+Alt+I"),
    )?;
    let view_sep = PredefinedMenuItem::separator(app)?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, Some(label("Tela cheia", "Ekran tomak")))?;
    let view_items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = if cfg!(debug_assertions) {
        vec![&reload, &devtools, &view_sep, &fullscreen]
    } else {
        vec![&reload, &view_sep, &fullscreen]
    };
    let view = Submenu::with_items(app, label("Visualizar", "Haree"), true, &view_items)?;

    let minimize = PredefinedMenuItem::minimize(app, Some(label("Minimizar", "Minimiza")))?;
    let close_window = PredefinedMenuItem::close_window(app, Some(label("Fechar", "Taka")))?;
    let window = Submenu::with_items(
        app,
        label("Janela", "Janela"),
        true,
        &[&minimize, &close_window],
    )?;

    let about = MenuItem::with_id(
        app,
        "about",
        label("Sobre o Cite", "Kona-ba Cite"),
        true,
        None::<&str>,
    )?;
    let help = Submenu::with_items(app, label("Ajuda", "Ajuda"), true, &[&about])?;

    let menu = if is_mac {
        let services = PredefinedMenuItem::services(app, Some(label("Serviços", "Servisu")))?;
        let hide = PredefinedMenuItem::hide(app, Some(label("Ocultar Cite", "Subar Cite")))?;
        let hide_others = PredefinedMenuItem::hide_others(app, Some(label("Ocultar outros", "Subar seluk")))?;
        let show_all = PredefinedMenuItem::show_all(app, Some(label("Mostrar tudo", "Hatudu hotu")))?;
        let sep_a = PredefinedMenuItem::separator(app)?;
        let sep_b = PredefinedMenuItem::separator(app)?;
        let sep_c = PredefinedMenuItem::separator(app)?;
        let sep_d = PredefinedMenuItem::separator(app)?;
        let app_menu = Submenu::with_items(
            app,
            "Cite",
            true,
            &[
                &about,
                &sep_a,
                &services,
                &sep_b,
                &hide,
                &hide_others,
                &show_all,
                &sep_c,
                &quit,
            ],
        )?;
        let _ = sep_d;
        Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])?
    } else {
        Menu::with_items(app, &[&file, &edit, &view, &window, &help])?
    };

    app.set_menu(menu)?;
    Ok(())
}
