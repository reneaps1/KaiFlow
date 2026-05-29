Act as a senior full-stack developer and UX/product engineer.

I need you to build a web demo for an internal Fujikura line balancing system. This is a frontend-only demo, deployable on GitHub Pages. There is no backend and no database. However, the demo must feel functional: it must load demo data, allow the user to add/edit data during the session, and persist temporary changes using localStorage. The user should be able to navigate between modules and see that entered data affects calculations, Yamazumi charts, scenarios, and reports.

TECHNICAL STACK
- Use plain HTML, CSS, and JavaScript.
- No backend.
- No database.
- No frameworks unless absolutely necessary.
- Must run locally by opening index.html or through GitHub Pages.
- Use localStorage for temporary persistence.
- Include a “Reset Demo Data” button to restore original demo data.
- Files suggested:
  - index.html
  - style.css
  - app.js
  - demoData.js
  - README.md

GENERAL PRODUCT CONCEPT
The system is for internal use at Fujikura. It is not multi-client. Do not include clients/customers as a module. The hierarchy is:

Fujikura
→ Plant
→ Area
→ Production Line
→ Process
→ Operations
→ Standard Times
→ Time Studies
→ Line Balance
→ Yamazumi
→ Scenarios
→ Report

The demo should help visualize how industrial engineers or production teams could calculate line balance based on available time, demand, operation times, and number of operators/stations.

MAIN OBJECTIVE
The system should answer:
“With this demand, these operations, these standard times, and this available production time, how many operators/stations do we need, where is the bottleneck, and how balanced is the line?”

CORE CALCULATIONS
Implement these calculations:

1. Takt Time
Formula:
Takt Time = Available Production Time / Required Production Quantity

Use seconds as the internal unit.

Example:
Available time = 7.5 hours effective production time
Required quantity = 900 pieces
Takt time = 30 seconds per piece

2. Total Work Content
Formula:
Total Work Content = Sum of all operation standard times

3. Theoretical Operators Required
Formula:
Operators Required = Total Work Content / Takt Time

Round up for suggested operators.

4. Station Load
Formula:
Station Load = Sum of operation times assigned to station

5. Idle Time per Station
Formula:
Idle Time = Takt Time - Station Load

If station load is greater than takt time, mark as bottleneck / overloaded.

6. Line Balance Efficiency
Formula:
Efficiency = Total Work Content / (Number of Stations × Takt Time)

Show as percentage.

7. Maximum Capacity per Hour
Formula:
Capacity per hour = 3600 / Cycle Time

Cycle time should be based on the highest station load.

8. Bottleneck
The bottleneck is the station with the highest load.
If highest load > takt time, show warning.

DEMO DATA
Create realistic demo data for Fujikura.

Use this sample structure:

Plant:
- Fujikura Puebla

Area:
- Assembly

Production Line:
- Harness Line 01

Process:
- Automotive Harness Assembly

Operations:
1. Wire cutting preparation – 8 sec
2. Terminal crimping – 18 sec
3. Seal insertion – 12 sec
4. Connector loading – 22 sec
5. Sub-assembly routing – 35 sec
6. Clip installation – 16 sec
7. Tape wrapping – 42 sec
8. Visual inspection – 20 sec
9. Electrical test – 30 sec
10. Final packing – 15 sec

Default demand:
- Required quantity per shift: 900 pieces
- Shift length: 8 hours
- Breaks: 30 minutes
- Meetings: 0 minutes
- Effective available time: 7.5 hours
- Available production time: 27,000 seconds

Expected takt:
- 27,000 / 900 = 30 sec

This should create an intentionally unbalanced situation because some operations exceed 30 seconds. The demo must show bottlenecks clearly.

MODULES / SCREENS

1. Dashboard / Overview
Show KPI cards:
- Plant
- Area
- Line
- Process
- Required pieces per shift
- Available time
- Takt time
- Total work content
- Suggested operators
- Line balance efficiency
- Bottleneck station
- Max capacity per hour

Also include a simple workflow visual:
Catalogs → Standard Times → Time Study → Balance → Yamazumi → Scenarios → Report

2. Catalogs Module
Allow the user to view/edit:
- Plant
- Area
- Production Line
- Process
- Operations list

Operations table columns:
- Sequence
- Operation name
- Operation code
- Standard time in seconds
- Active status

Allow:
- Add operation
- Edit operation
- Delete/deactivate operation
- Reorder operation sequence if possible

3. Standard Times Database
This module shows the official standard time per operation.

Table columns:
- Operation sequence
- Operation name
- Standard time seconds
- Version
- Status
- Effective date
- Last updated

Include actions:
- Edit standard time
- Create new version
- Mark active/inactive

For demo simplicity, updating the standard time should immediately affect balance calculations.

4. Time Study / Chronometer Module
This module simulates time and motion studies.

User selects an operation.
Then enters multiple observed times:
- Observation 1
- Observation 2
- Observation 3
- Observation 4
- Observation 5

Calculate:
- Average observed time
- Min
- Max
- Range
- Suggested standard time

Include optional fields:
- Performance factor, default 1.00
- Allowance factor, default 0.10

Formula:
Normal Time = Average Observed Time × Performance Factor
Standard Time = Normal Time × (1 + Allowance Factor)

Add button:
“Apply as Temporary Standard Time”

When clicked:
- Update standard time for that operation
- Save to localStorage
- Refresh balance and Yamazumi

5. Line Balance Module
Inputs:
- Required quantity per shift
- Shift hours
- Break minutes
- Meeting minutes
- Available time calculated automatically
- Takt time calculated automatically
- Number of stations/operators desired

Show:
- Total work content
- Theoretical operators required
- Suggested operators
- Current selected operators/stations
- Balance efficiency
- Cycle time
- Capacity per hour

Functionality:
- Auto-assign operations to stations using a simple greedy algorithm:
  - Sort operations by sequence.
  - Add operations to current station until adding the next would exceed takt time.
  - If it exceeds takt, move to next station.
  - If an individual operation exceeds takt, still assign it but mark the station as overloaded.
- Allow manual station assignment if possible:
  - User can change station number for each operation.
  - Recalculate station loads immediately.

6. Yamazumi Module
This is critical.

Create a Yamazumi-style chart:
- X axis: stations
- Y axis: seconds
- Each station is a stacked bar showing operations assigned to that station.
- Draw a horizontal takt time reference line.
- If a station exceeds takt time, visually mark it as overloaded.
- Show station load value.
- Show idle time if below takt.
- Show bottleneck station.

If using only plain JS/CSS, create the chart with divs. Do not require chart libraries unless necessary.

The Yamazumi module must include:
- Station cards
- Operation stacks
- Takt line
- Bottleneck highlight
- Efficiency summary

7. Scenarios Module
Allow users to compare multiple scenarios.

Default scenarios:
- Current state
- +1 operator
- Demand increase 10%
- Improve bottleneck by 15%
- Reduce tape wrapping time by 20%

Each scenario should show:
- Demand
- Available time
- Takt time
- Number of operators/stations
- Efficiency
- Bottleneck
- Capacity per hour
- Feasibility status:
  - Green: feasible, no station above takt
  - Yellow: close to takt, station load > 90% of takt
  - Red: not feasible, station above takt

Allow user to:
- Create a custom scenario
- Change demand
- Change number of operators
- Apply improvement percentage to one operation
- Recalculate scenario
- Compare against current state

8. Report Module
Create a clean printable report.

Report sections:
- Header: Fujikura Line Balance Demo
- Plant / Area / Line / Process
- Demand and available time
- Takt time
- Total work content
- Suggested operators
- Balance efficiency
- Bottleneck
- Station summary
- Operation assignment by station
- Scenario comparison

Include buttons:
- Print report
- Export as CSV
- Reset demo data

The CSV export should include:
- Station number
- Operation sequence
- Operation name
- Standard time
- Station load
- Takt time
- Status

9. Users & Permissions Mock Module
Since this is a demo, no real login is needed.

Create a visual mock showing roles:
- Admin
- Industrial Engineering
- Production Supervisor
- Quality
- Viewer

Show what each role can do:
- Edit catalogs
- Edit standard times
- Run balance
- Approve balance
- View reports

This module can be read-only.

UX / DESIGN REQUIREMENTS
Use a modern industrial SaaS look:
- Clean dashboard
- Left sidebar navigation
- Top header
- Cards
- Tables
- Clear KPI badges
- Minimal but professional style
- Use green as the main accent color
- White/gray background
- Strong readability
- Spanish UI labels

Use Spanish labels throughout the application.

Suggested navigation labels:
- Dashboard
- Catálogos
- Tiempos Estándar
- Estudios de Tiempo
- Balanceo
- Yamazumi
- Escenarios
- Reporte
- Permisos
- Reset Demo

IMPORTANT UI BEHAVIOR
- Navigation should not reload the page.
- Use JavaScript state rendering.
- Changes should be saved to localStorage.
- Refreshing the browser should keep the modified demo state.
- Reset button should restore default data from demoData.js.
- Every module should feel connected.
- Changing a standard time should update balance calculations.
- Changing demand should update takt time.
- Changing station count should update balance.
- Yamazumi should reflect current balance assignments.
- Scenarios should not overwrite current state unless the user clicks “Apply scenario”.

DATA MODEL IN JAVASCRIPT
Use a single state object similar to:

const demoState = {
  plant: {...},
  area: {...},
  line: {...},
  process: {...},
  operations: [...],
  standardTimes: [...],
  timeStudies: [...],
  balanceSettings: {...},
  stationAssignments: [...],
  scenarios: [...],
  roles: [...]
};

Persist this object in localStorage using key:
"fujikuraLineBalanceDemo"

RECOMMENDED FUNCTIONS
Implement clear functions:

loadState()
saveState()
resetState()
renderApp()
renderDashboard()
renderCatalogs()
renderStandardTimes()
renderTimeStudy()
renderLineBalance()
renderYamazumi()
renderScenarios()
renderReport()
calculateTaktTime()
calculateTotalWorkContent()
calculateRequiredOperators()
calculateStationLoads()
calculateEfficiency()
calculateCapacity()
detectBottleneck()
autoBalanceOperations()
exportReportCSV()
printReport()

ACCEPTANCE CRITERIA
The demo is complete when:
1. It opens in browser without backend.
2. It has all modules listed above.
3. It contains Fujikura demo data.
4. It performs real takt, operator, efficiency, capacity, and bottleneck calculations.
5. It shows a Yamazumi chart.
6. User can edit times and see calculations update.
7. User can enter time observations and apply calculated standard time.
8. User can create or compare scenarios.
9. User can print/export a report.
10. Data persists temporarily using localStorage.
11. Reset returns the app to original demo data.
12. It is ready to publish on GitHub Pages.

DELIVERABLE
Generate the full project code:
- index.html
- style.css
- app.js
- demoData.js
- README.md

Also include instructions to run locally and deploy to GitHub Pages.