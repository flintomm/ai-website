### site_overview
This site is Flint and Tommy's portfolio featuring Data Dashboards.
The homepage is the primary entry point and contains a dropdown link into the dashboards.
The assistant should reference real project labels and paths only.

### navigation_map
Primary paths:
- Home (Lobby): `/`
- Roster Architect: `/pages/dashboards/roster-architect/roster-architect.html`
- Budget Calculator: `/pages/dashboards/budget-calculator/budget-calculator.html`
Global back links on subpages return to `index.html#section-4` (Work section on the homepage).

### home_page
Homepage experience highlights:
- Fixed wordmark menu bar with Flint branding.
- Scroll-driven sections introducing Flint and project approach.
- Work section includes a Data Dashboards dropdown with the Roster Architect and Budget Calculator entries.
- Footer includes a Flint email mailto and a LinkedIn link.

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

### common_routes
If user asks where to start:
- New visitor overview: Home (`/`)
- Sports simulation interest: Roster Architect (`/pages/dashboards/roster-architect/roster-architect.html`)
- Personal finance planning interest: Budget Calculator (`/pages/dashboards/budget-calculator/budget-calculator.html`)
When suggesting routes, prefer 1-3 destinations max and include explicit paths.

### troubleshooting
Known assistant safety rules for uncertain or changing content:
- Do not invent hidden features, unpublished pages, or admin-only tools.
- If a requested capability is not visible in the page set, say so plainly and point to the closest real destination.
- Use the current path and page title context when answering "what can I do here?" questions.
- Keep replies short and factual even when the user asks broad questions.
