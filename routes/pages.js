import { html } from "../lib/db.js";
import { mainPage } from "../views/main.js";
import { timelinePage } from "../views/timeline.js";
import { boardPage } from "../views/board.js";
import { batchImportPage } from "../views/batch-import.js";
import { mobileInspectionPage } from "../views/mobile-inspection.js";
import { rulesPage } from "../views/rules.js";

export function handlePages(req, res, url) {
  if (url.pathname === "/") {
    html(res, mainPage());
    return true;
  }
  if (url.pathname === "/timeline") {
    html(res, timelinePage());
    return true;
  }
  if (url.pathname === "/board") {
    html(res, boardPage());
    return true;
  }
  if (url.pathname === "/batch-import") {
    html(res, batchImportPage());
    return true;
  }
  if (url.pathname === "/mobile-inspection") {
    html(res, mobileInspectionPage());
    return true;
  }
  if (url.pathname === "/rules") {
    html(res, rulesPage());
    return true;
  }
  return false;
}
