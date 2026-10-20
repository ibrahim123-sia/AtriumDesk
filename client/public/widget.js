/*
 * AtriumDesk website widget — a university adds its admissions assistant to
 * its own website with one tag:
 *
 *   <script src="https://<your AtriumDesk address>/widget.js"
 *           data-university="<your university's id>" async></script>
 *
 * Optional: data-color="#0D9488" (button colour), data-label="Ask us".
 * It adds a chat button in the bottom-right corner that opens the guest
 * assistant (the /embed page) in a panel. Nothing loads until it's opened.
 */
(function () {
  var script = document.currentScript;
  if (!script || document.getElementById("atriumdesk-widget")) return;
  var base = new URL(script.src, window.location.href).origin;
  var university = (script.getAttribute("data-university") || "").trim();
  var color = /^#[0-9a-fA-F]{3,8}$/.test(script.getAttribute("data-color") || "") ? script.getAttribute("data-color") : "#0D9488";
  var label = (script.getAttribute("data-label") || "Ask us").slice(0, 40);

  var root = document.createElement("div");
  root.id = "atriumdesk-widget";
  root.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;";

  var panel = document.createElement("div");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", label);
  panel.style.cssText =
    "display:none;position:absolute;right:0;bottom:64px;width:380px;height:600px;max-width:calc(100vw - 40px);" +
    "max-height:calc(100vh - 110px);border-radius:16px;overflow:hidden;background:#fff;" +
    "box-shadow:0 18px 50px rgba(6,47,43,.28);border:1px solid rgba(0,0,0,.08);";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", label);
  button.style.cssText =
    "display:flex;align-items:center;gap:8px;height:52px;padding:0 18px;border:0;border-radius:26px;cursor:pointer;" +
    "color:#fff;font-size:15px;font-weight:600;box-shadow:0 8px 24px rgba(6,47,43,.3);background:" + color + ";";
  button.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var text = document.createElement("span");
  text.textContent = label;
  button.appendChild(text);

  var frame = null;
  function setOpen(open) {
    if (open && !frame) {
      frame = document.createElement("iframe");
      frame.title = label;
      frame.src = base + "/embed" + (university ? "?u=" + encodeURIComponent(university) : "");
      frame.style.cssText = "width:100%;height:100%;border:0;display:block;";
      frame.setAttribute("allow", "clipboard-write");
      panel.appendChild(frame);
    }
    panel.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  button.addEventListener("click", function () {
    setOpen(panel.style.display === "none");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.style.display !== "none") {
      setOpen(false);
      button.focus();
    }
  });

  root.appendChild(panel);
  root.appendChild(button);
  (document.body || document.documentElement).appendChild(root);
})();
