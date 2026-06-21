import { html } from "../lib/db.js";
import { mainPage } from "../views/main.js";
import { timelinePage } from "../views/timeline.js";

export function handlePages(req, res, url) {
  if (url.pathname === "/") {
    html(res, mainPage());
    return true;
  }
  if (url.pathname === "/timeline") {
    html(res, timelinePage());
    return true;
  }
  return false;
}
