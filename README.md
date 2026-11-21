# Barotac Viejo — Fisher Safety & Catch Monitoring (Prototype)

Working prototype for the study:

> *An Offline-First Mobile Safety and Catch Monitoring Application with Voice Alerts for Small-Scale Municipal Fisherfolk in Barotac Viejo, Iloilo*

Two interfaces share one data store, so a check-in made on the phone appears on the LGU dashboard.

| Interface | File | Who uses it |
| --- | --- | --- |
| MDRRMO / LGU dashboard | `index.html` | MDRRMO operations, MAO fisheries staff, administrator |
| Fisher application | `app.html` | Small-scale fisher (shown inside a phone frame) |

---

## 1. Open it in VS Code

1. Unzip this folder anywhere on your computer.
2. In VS Code: **File → Open Folder…** and choose the unzipped folder.
3. Open a terminal in VS Code (**Terminal → New Terminal**) and run:

```bash
npm start
```

Then open **http://localhost:3007** for the dashboard and
**http://localhost:3007/app.html** for the fisher app.

> `npm start` runs `node server.js`, a zero-dependency static server. There is nothing to install:
> `node_modules` is not used and `npm install` is not required.

If you do not have Node.js, right-click `index.html` in the VS Code Explorer and choose
**Open with Live Server** (Live Server extension), or run `python3 -m http.server 3007` and open
`http://localhost:3007`.

> Use a local server rather than double-clicking the HTML files. The pages are ES modules, and
> browsers block module imports from `file://` URLs.

### Recommended extensions

VS Code will suggest them from `.vscode/extensions.json`:

- **Live Server** — one-click static preview
- **EditorConfig for VS Code** — consistent formatting

`.vscode/launch.json` also lets you press **F5** to debug the dashboard in Chrome with the
server already running.

---

## 2. Demo script (5 minutes)

Open the dashboard and the fisher app in **two browser tabs side by side**.

1. **Offline recording.** In the fisher app, turn the **Network** switch off (airplane mode).
   Tap **I'm safe**, then record a catch. The phone shows “2 pending”; the dashboard does not change.
2. **Reconnection.** Turn the Network switch back on. The queue uploads in order: the new check-in
   appears on the dashboard map and in the trip trail.
3. **Overdue engine.** On the dashboard press **+60m** twice in the header clock. A trip crosses its
   expected return plus the 60-minute grace period, and a Priority 2 alert appears with the SMS
   recipients listed. Press **Acknowledge & dispatch** to close it.
4. **Voice advisory.** Publish a **Red** advisory on the dashboard. Switch to the fisher app: the
   advisory card turns red and the phone reads it aloud (Hiligaynon prompt text, Filipino voice).
5. **Role-based access.** Change the dashboard role to **MAO**: positions are masked and the catch
   summary with CSV export becomes available. Switch to **Administrator** to change the grace period.
6. **Audit trail.** Open any **Trail** on the dashboard; the view is written to the audit log, as
   required for location data under RA 10173.

Use **Reset demo data** (Activity & audit panel) to return everything to the starting state.

---

## 3. What is real and what is simulated

**Real behaviour**

- Offline-first storage: the device store and outbox are separate from the “server” store, writes are
  queued and replayed in order, and sync is refused while offline.
- Overdue rule engine: expected return + configurable grace period, priority tiers, acknowledgement,
  alert close-out on return.
- Advisory publishing with risk levels and voice read-out (Web Speech API).
- Role-based access (MDRRMO / MAO / Administrator) and an audit log of trail views.
- Catch summary by species and CSV export in the exact columns needed for MAO/BFAR reporting.

**Simulated, and why**

- **Browser storage stands in for the backend API, the database and the SMS gateway.** There is no
  server process; two tabs on the same browser share the data through local storage.
- **Map tiles are not loaded.** The chart is schematic and drawn from latitude/longitude; a production
  build would cache offline tiles.
- **Hiligaynon voice** uses the closest available text-to-speech voice; recorded prompts would replace
  it in the real application.
- **The header clock** is a demo device for walking a trip past its expected return without waiting
  hours. Press **reset** to return to real time.

The production system described in the proposal is a Flutter/Android app with a backend API, an alert
service and this web dashboard. What is in this folder is the interaction and rule prototype used for
validation with the MDRRMO and LGU.

---

## 4. Files

```
index.html            Dashboard page (MDRRMO / LGU)
app.html              Fisher app page (phone frame)
server.js             Zero-dependency static server
package.json          npm start script
assets/styles.css     All styling for both interfaces
assets/store.js       Data layer: seed, device store, outbox, sync, rule engine, formatting
assets/dashboard.js   Dashboard rendering and interactions
assets/fisherapp.js   Fisher app rendering, check-in, catch log, voice
assets/map.js         Schematic chart, projection, boat markers
.vscode/              Extensions, launch configuration
```

Data is stored in the browser under the keys `bvsms.db.v4`, `bvsms.device.v4` and `bvsms.clock.v4`.
To clear it manually: DevTools → Application → Local Storage → delete the `bvsms.*` keys.

---

## 5. Demo data

Six registered fishers and five trips, with two already past their expected return, plus advisories
and catch entries. All names and records are invented for demonstration; they are not real fisherfolk
of Barotac Viejo.
