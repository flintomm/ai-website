### site_overview
This site is Flint and Tommy's portfolio with three main areas: Creative work, Data Dashboards, and Digital Games.
The homepage is the primary entry point and contains dropdown links into each project category.
The assistant should reference real project labels and paths only.

### navigation_map
Primary paths:
- Home (Lobby): `/`
- Creative Corner: `/pages/creative/creative-work.html`
- Flints World: `/pages/creative/flints-world.html`
- Roster Architect: `/pages/dashboards/roster-architect/roster-architect.html`
- Budget Calculator: `/pages/dashboards/budget-calculator/budget-calculator.html`
- Tower Defense: `/pages/games/tower-defense.html`
- Board Arcade: `/pages/games/board-hub.html`
Global back links on subpages return to `index.html#section-4` (Work section on the homepage).

### home_page
Homepage experience highlights:
- Fixed wordmark menu bar with Flint branding.
- Scroll-driven sections introducing Flint and project approach.
- Work section includes three dropdown categories:
  - Creative Corner
  - Data Dashboards
  - Digital Games
- Creative dropdown currently links to:
  - Flints World
  - between the spaces
- Footer includes a Flint email mailto to `flint@tphch.com` and a LinkedIn link.

### creative_corner
Creative Corner page path: `/pages/creative/creative-work.html`.
Main intent: showcase creative projects and active/in-progress concepts.
Current cards:
- Flints World (Live) with internal link to `/pages/creative/flints-world.html`
- between the spaces (Live) with external link to `https://www.tymmop.com`
- Movie Trailers (In Progress)
- Comics (In Progress)
Tone of this page is artistic and storytelling-focused.

### flints_world
Flints World page path: `/pages/creative/flints-world.html`.
Purpose: a top-down ambient pixel room centered on Flint.
Scene behavior:
- Flint cycles through `working`, `look`, `idle`, and `wave` states.
- One cameo friend appears at a time and leaves after a short room event.
- Tiny status bubbles such as notes, thoughts, and `zzz` may appear above characters.
Page structure:
- Shared site nav and Flint branding
- Main pixel-room stage with code-built props and characters
- Status/info panel describing Flint's current state and guest activity
- Shared floating Flint assistant in the bottom-right corner

### roster_architect
Roster Architect path: `/pages/dashboards/roster-architect/roster-architect.html`.
Purpose: NBA roster and payroll simulator with salary-cap constraints.
Core setup flow (step buttons):
1. Player Data
2. Salary Cap
3. Select Team
4. Start Mode
Key interactions:
- Import players JSON/CSV or generate random pool.
- Configure roster size and repeater mode.
- Start snake draft or manual assign mode.
- Track draft state (current pick, pool count, last pick).
- Review team outcomes including payroll/tax tables and roster panel.
Tech and concepts called out on page: Snake Draft, Salary Cap Engine, Imported/Generated Data, Vanilla JS.

### budget_calculator
Budget Calculator path: `/pages/dashboards/budget-calculator/budget-calculator.html`.
Purpose: spreadsheet-style budget planner for planned vs actual tracking.
Setup area:
- Period selector (weekly/monthly/yearly)
- Budget target input
Major sections:
- Income table (add income sources)
- Expense Sheet (category, item, planned, actual)
- Finale panel with Budget Status (on target/under/over)
- Stats including Income, Planned, Actual, Safe to Spend
- Insights panel including 50/30/20 reference outputs
- Visualization controls (group by, chart type, metric)
Data persists in browser session storage for the active session.

### tower_defense
Tower Defense path: `/pages/games/tower-defense.html`.
Purpose: real-time canvas strategy game.
Gameplay surfaces:
- Main canvas (`#game`) with HUD chips for Credits, Wave, Enemies, Lives.
- Build panel showing tower list and tower inspect details.
- Control buttons:
  - Start Next Wave
  - Pause
  - Reset
On-page tip: select a tower, then click on the map to place it.
Tech strip references Canvas API, Waypoint Pathing, Wave Engine, and Vanilla JS.

### board_arcade
Board Arcade path: `/pages/games/board-hub.html`.
Purpose: multi-game strategy suite with tabbed classic games.
Game tabs:
- Tic-Tac-Toe
- Checkers
- Chess
Common controls:
- Tic-Tac-Toe: Reset, Swap First Player
- Checkers: Reset, Swap First Player
- Chess: Reset, Flip Board
Game status text updates in each panel (for turns, check/checkmate/stalemate, winners, etc.).
Tech strip references Rules Engine, Move Validation, Canvas UI, and Vanilla JS.

### common_routes
If user asks where to start:
- New visitor overview: Home (`/`)
- Creative/media interest: Creative Corner (`/pages/creative/creative-work.html`)
- Pixel room or ambient world interest: Flints World (`/pages/creative/flints-world.html`)
- Sports simulation interest: Roster Architect (`/pages/dashboards/roster-architect/roster-architect.html`)
- Personal finance planning interest: Budget Calculator (`/pages/dashboards/budget-calculator/budget-calculator.html`)
- Action game interest: Tower Defense (`/pages/games/tower-defense.html`)
- Board game interest: Board Arcade (`/pages/games/board-hub.html`)
When suggesting routes, prefer 1-3 destinations max and include explicit paths.

### troubleshooting
Known assistant safety rules for uncertain or changing content:
- Do not invent hidden features, unpublished pages, or admin-only tools.
- If a requested capability is not visible in the page set, say so plainly and point to the closest real destination.
- Use the current path and page title context when answering "what can I do here?" questions.
- Keep replies short and factual even when the user asks broad questions.
