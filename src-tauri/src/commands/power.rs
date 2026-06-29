//! Power-plan control and Game Mode.
//!
//! Game Mode's only system change is switching to a High/Ultimate Performance
//! power plan — a real, measurable change that prevents CPU core-parking and
//! down-clocking. The previous plan is saved and restored exactly. BoostForge
//! intentionally makes no unverifiable "FPS boost" claims.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util::{parse_ps_array, run_command, run_powershell};

const ULTIMATE_GUID: &str = "e9a42b02-d5df-448d-aa00-03f14749eb61";
const HIGH_PERF_GUID: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

#[derive(Serialize, Clone)]
pub struct PowerPlan {
    pub guid: String,
    pub name: String,
    pub active: bool,
}

#[tauri::command]
pub fn list_power_plans() -> AppResult<Vec<PowerPlan>> {
    parse_powercfg_list()
}

#[tauri::command]
pub fn set_power_plan(state: State<AppState>, guid: String) -> AppResult<()> {
    let previous = active_plan_guid().ok();
    set_active(&guid)?;
    if let Some(prev) = previous {
        if prev != guid {
            state.record(
                "power_plan",
                format!("Switched power plan to {}", plan_name(&guid)),
                serde_json::json!({ "previous_guid": prev }),
            );
        }
    }
    Ok(())
}

#[derive(Serialize)]
pub struct GameModeStatus {
    pub active: bool,
    pub previous_plan: Option<String>,
    pub applied_plan: Option<String>,
    pub detected_games: Vec<String>,
}

#[tauri::command]
pub fn get_game_mode_status(state: State<AppState>) -> AppResult<GameModeStatus> {
    let game = state
        .game
        .lock()
        .map_err(|_| AppError::other("game state locked"))?;
    Ok(GameModeStatus {
        active: game.active,
        previous_plan: game.previous_plan.clone(),
        applied_plan: game.applied_plan.clone(),
        detected_games: detect_games(&state),
    })
}

#[tauri::command]
pub fn apply_game_mode(state: State<AppState>) -> AppResult<GameModeStatus> {
    let target = ensure_performance_plan()?;
    let previous = active_plan_guid().ok();
    set_active(&target)?;

    {
        let mut game = state
            .game
            .lock()
            .map_err(|_| AppError::other("game state locked"))?;
        game.active = true;
        game.previous_plan = previous.clone();
        game.applied_plan = Some(target.clone());
    }

    if let Some(prev) = previous {
        state.record(
            "game_mode",
            "Engaged Game Mode (performance power plan)".into(),
            serde_json::json!({ "previous_guid": prev }),
        );
    }

    get_game_mode_status(state)
}

#[tauri::command]
pub fn restore_game_mode(state: State<AppState>) -> AppResult<GameModeStatus> {
    let previous = {
        let game = state
            .game
            .lock()
            .map_err(|_| AppError::other("game state locked"))?;
        game.previous_plan.clone()
    };
    if let Some(prev) = previous {
        set_active(&prev)?;
    }
    {
        let mut game = state
            .game
            .lock()
            .map_err(|_| AppError::other("game state locked"))?;
        game.active = false;
        game.applied_plan = None;
        game.previous_plan = None;
    }
    get_game_mode_status(state)
}

/// Sets a power plan active. Public so the undo system can reuse it.
pub fn set_active(guid: &str) -> AppResult<()> {
    run_command("powercfg", &["/setactive", guid]).map(|_| ())
}

/// Power plan names are localized (e.g. "Kiegyensúlyozott" on Hungarian
/// Windows) and `powercfg`'s raw console output is encoded in the system's
/// OEM codepage, which mangles non-ASCII text if read as UTF-8. Routing
/// through PowerShell's `ConvertTo-Json` sidesteps that entirely — non-ASCII
/// characters are escaped as `\uXXXX` in the JSON text, which `serde_json`
/// decodes correctly regardless of console codepage.
fn active_plan_guid() -> AppResult<String> {
    let script = r#"
$line = powercfg /getactivescheme
if ($line -match '([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})') {
  $matches[1]
}
"#;
    let out = run_powershell(script)?;
    let guid = out.trim().to_string();
    if guid.is_empty() {
        Err(AppError::other("could not determine active power plan"))
    } else {
        Ok(guid)
    }
}

fn parse_powercfg_list() -> AppResult<Vec<PowerPlan>> {
    // `powercfg`'s narrow-text console output is decoded by PowerShell itself
    // using the active console codepage (the OEM codepage, e.g. 852 on
    // Hungarian Windows) — not UTF-8 — which is what actually mangles
    // accented plan names. Switching the session to the UTF-8 codepage
    // before invoking it, and telling PowerShell to decode with the same
    // encoding, fixes the capture at the source.
    let script = r#"
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
powercfg /list | ForEach-Object {
  if ($_ -match '([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})\s*\(([^)]*)\)\s*(\*)?\s*$') {
    [pscustomobject]@{
      Guid = $matches[1]
      Name = $matches[2]
      Active = [bool]$matches[3]
    }
  }
} | ConvertTo-Json -Depth 2
"#;

    #[derive(Deserialize)]
    struct Raw {
        #[serde(rename = "Guid")]
        guid: String,
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "Active")]
        active: bool,
    }

    let raw: Vec<Raw> = parse_ps_array(&run_powershell(script)?)?;
    Ok(raw
        .into_iter()
        .map(|r| PowerPlan {
            guid: r.guid,
            name: r.name.trim().to_string(),
            active: r.active,
        })
        .collect())
}

/// Returns the GUID of a performance plan, creating the Ultimate Performance
/// plan from its template if neither it nor High Performance exist yet.
fn ensure_performance_plan() -> AppResult<String> {
    let plans = parse_powercfg_list()?;
    if let Some(p) = plans
        .iter()
        .find(|p| p.guid.eq_ignore_ascii_case(ULTIMATE_GUID) || p.name.to_lowercase().contains("ultimate"))
    {
        return Ok(p.guid.clone());
    }
    if let Some(p) = plans
        .iter()
        .find(|p| p.guid.eq_ignore_ascii_case(HIGH_PERF_GUID) || p.name.to_lowercase().contains("high performance"))
    {
        return Ok(p.guid.clone());
    }
    // Create Ultimate Performance from the well-known template.
    let script = format!(
        r#"
$out = powercfg -duplicatescheme {ULTIMATE_GUID}
if ($out -match '([0-9a-fA-F-]{{8}}-[0-9a-fA-F-]{{4}}-[0-9a-fA-F-]{{4}}-[0-9a-fA-F-]{{4}}-[0-9a-fA-F-]{{12}})') {{
  $matches[1]
}}
"#
    );
    let out = run_powershell(&script)?;
    let guid = out.trim().to_string();
    if !guid.is_empty() {
        Ok(guid)
    } else {
        // Fall back to the canonical High Performance GUID.
        Ok(HIGH_PERF_GUID.to_string())
    }
}

fn plan_name(guid: &str) -> String {
    parse_powercfg_list()
        .ok()
        .and_then(|plans| plans.into_iter().find(|p| p.guid.eq_ignore_ascii_case(guid)))
        .map(|p| p.name)
        .unwrap_or_else(|| guid.to_string())
}

/// Detects well-known game / launcher processes currently running. This is
/// informational only — Game Mode never auto-engages without user consent.
fn detect_games(state: &State<AppState>) -> Vec<String> {
    const KNOWN: &[(&str, &str)] = &[
        ("steam.exe", "Steam"),
        ("EpicGamesLauncher.exe", "Epic Games"),
        ("Battle.net.exe", "Battle.net"),
        ("RiotClientServices.exe", "Riot Client"),
        ("cs2.exe", "Counter-Strike 2"),
        ("VALORANT-Win64-Shipping.exe", "VALORANT"),
        ("FortniteClient-Win64-Shipping.exe", "Fortnite"),
        ("javaw.exe", "Minecraft (Java)"),
        ("LeagueofLegends.exe", "League of Legends"),
        ("GTA5.exe", "Grand Theft Auto V"),
        ("Cyberpunk2077.exe", "Cyberpunk 2077"),
        ("eldenring.exe", "Elden Ring"),
    ];
    let Ok(sys) = state.sys.lock() else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for p in sys.processes().values() {
        let name = p.name();
        if let Some((_, label)) = KNOWN
            .iter()
            .find(|(exe, _)| exe.eq_ignore_ascii_case(name))
        {
            if !found.contains(&label.to_string()) {
                found.push(label.to_string());
            }
        }
    }
    found
}
