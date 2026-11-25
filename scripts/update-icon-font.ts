// Run with Bun after adding a Material Symbols glyph to a web component.
// Keeping the subset in source lets ordinary builds and browsers work offline.
const names = `
account_balance_wallet add add_circle admin_panel_settings album arrow_back arrow_drop_down
arrow_forward auto_awesome bedtime block bolt bug_report business chat_bubble check check_circle
chevron_left chevron_right close cloud_upload code comment content_copy currency_bitcoin delete
delete_sweep desktop_windows download drive_file_move edit error expand_less expand_more
extension fact_check favorite filter_alt forum graphic_eq history home info ios_share key
language laptop_mac layers link location_on lock login logout manage_search message music_note
music_off open_in_new pause person person_add person_check phone_android play_arrow play_circle
power_settings_new public qr_code qr_code_scanner queue_music radio refresh remove remove_circle
save search search_off security send sensors sensors_off settings share signal_wifi_off star
stop stop_circle storefront sync terminal translate tune volume_off volume_up volunteer_activism
warning waving_hand wifi
`.trim().split(/\s+/).sort();
const query = new URLSearchParams({
  family: "Material Symbols Outlined:wght,FILL@100..700,0..1",
  icon_names: names.join(","),
  display: "block",
});
const css = await fetch("https://fonts.googleapis.com/css2?" + query, {
  headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" },
});
if (!css.ok) throw new Error("Google Fonts returned " + css.status);
const source = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\) format\('woff2'\)/.exec(await css.text())?.[1];
if (!source) throw new Error("Missing WOFF2 source for the requested glyphs");
const response = await fetch(source);
if (!response.ok) throw new Error("Font download returned " + response.status);
const bytes = new Uint8Array(await response.arrayBuffer());
if (new TextDecoder().decode(bytes.subarray(0, 4)) !== "wOF2") throw new Error("Invalid WOFF2 response");
await Bun.write(new URL("../src/assets/material-symbols.woff2", import.meta.url), bytes);

export {};
