# Feature Specification: Consolidated Service Controls

**Feature Branch**: `002-consolidated-controls`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "Replace the per-service control 'garland' (status badge + Start + Stop + run/debug toggle) with a single morphing action button whose shape and ring convey the service status. launch services show a run button plus a custom debug icon at rest, with no mode switcher."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a service's state at a glance (Priority: P1)

A developer watching the Run Manager panel wants to know, instantly, what every
service is doing. Today each row carries a text status badge plus separate Start and
Stop buttons; with many services the row is a cluttered "garland". In the new design
each service has **one action button whose appearance is its status** — and clicking
that button performs the obvious action.

**Why this priority**: This is the core of the feature and a viable standalone MVP —
even with nothing else, the panel becomes scannable and every row loses three or four
controls. It delivers value for every service type on its own.

**Independent Test**: Open the Run Manager panel with services in different states and
confirm each service's state is identifiable from its action button alone (no text
badge), and that clicking the button starts or stops the service as expected.

**Acceptance Scenarios**:

1. **Given** a stopped service, **When** the developer looks at its row, **Then** the
   action button shows a "start" appearance, and clicking it starts the service.
2. **Given** a service that is starting, **When** the developer looks at its row,
   **Then** the action button shows an animated "starting" appearance, and clicking it
   stops the service.
3. **Given** a running service and a separate ready service (health check passed),
   **When** the developer looks at both rows, **Then** the two are visually
   distinguishable, and clicking either button stops that service.
4. **Given** a crashed service, **When** the developer looks at its row, **Then** the
   action button shows a distinct error appearance, and clicking it starts the service
   again.
5. **Given** any running service, **When** the developer looks at its row, **Then** no
   standalone text status badge is present.

---

### User Story 2 - Launch in run or debug without a mode switcher (Priority: P2)

A developer working with a `launch`-type service (a debuggable configuration) wants to
start it in either run or debug mode. Today this means first flipping an ambiguous
run/debug toggle, then pressing Start. In the new design the choice **is** the launch
action: at rest the service shows a run button and a debug button side by side —
clicking one launches the service in that mode.

**Why this priority**: Builds on User Story 1 for the subset of services that support
debugging. It removes a confusing two-step interaction. Lower priority because the
P1 morphing button already works for every service.

**Independent Test**: Open the panel with a `launch`-type service, confirm it shows a
run option and a debug option at rest, launch it via the debug option, and verify the
service started in debug mode.

**Acceptance Scenarios**:

1. **Given** a stopped `launch` service, **When** the developer looks at its row,
   **Then** it shows both a run option and a debug option, with no separate run/debug
   toggle.
2. **Given** a stopped `launch` service, **When** the developer clicks the debug
   option, **Then** the service starts in debug mode and that button morphs through the
   starting and running states.
3. **Given** a `launch` service that is not stopped, **When** the developer looks at
   its row, **Then** only the active action button is shown; both options reappear once
   the service returns to stopped.
4. **Given** a non-`launch` service, **When** the developer looks at its row, **Then**
   it shows a single action button with no run/debug options.

---

### Edge Cases

- **No health check**: a service without a health check never reaches the "ready"
  state — it stays "running", shown with the plain running appearance.
- **Crash from any state**: a service that crashes shows the distinct error appearance
  regardless of which state it crashed from; the action available is to start it again.
- **Debug session while running**: once a `launch` service is running, its button does
  not distinguish run from debug — the active debug session is surfaced by the editor's
  own debug UI, not by this button.
- **Accessibility**: state is conveyed by colour and shape, so every action button also
  carries a textual tooltip naming the current state and the action it performs.
- **Restart**: the Restart control stays available and separate; it is never folded
  into the morphing button.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each service row MUST present an action button whose appearance conveys
  the service's current status.
- **FR-002**: The action button MUST show a visually distinct appearance for each of
  the five service statuses: stopped, starting, running, ready, crashed.
- **FR-003**: The "starting" status MUST be shown with an animated indication that the
  service is in the process of starting.
- **FR-004**: The "ready" status (health check passed) MUST be visually distinct from
  the "running" status, so the health-check result is visible at a glance.
- **FR-005**: Clicking the action button MUST perform the appropriate action — start
  the service when it is stopped or crashed, stop it otherwise.
- **FR-006**: The standalone text status badge MUST be removed from the service row.
- **FR-007**: A Restart control MUST remain available for every service as a separate,
  always-visible button.
- **FR-008**: A `launch`-type service at rest MUST offer a run option and a debug
  option, with no separate run/debug mode switcher.
- **FR-009**: While a `launch`-type service is not stopped, only the active action
  button MUST be shown; both the run and debug options MUST reappear when the service
  returns to stopped.
- **FR-010**: Launching via the debug option MUST start the service in debug mode;
  launching via the run option MUST start it in run mode.
- **FR-011**: A non-`launch` service MUST present a single action button, with no
  run/debug options.
- **FR-012**: Every action button MUST carry a textual tooltip naming the current
  state and the action it performs.
- **FR-013**: The debug option MUST be presented with a custom debug icon, not a
  generic emoji.

### Key Entities *(include if feature involves data)*

- **Service status**: the lifecycle state of a service — one of stopped, starting,
  running, ready, crashed. Drives the action button's appearance. This is the existing
  status model, unchanged by this feature.
- **Service type**: whether a service is a `launch`-type (debuggable) service or
  another type. Determines whether the row offers a run/debug choice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can identify any service's state from its action button
  alone — shape and colour — without reading any text.
- **SC-002**: A non-`launch` running service row presents exactly two controls (the
  action button and Restart), down from four or more today.
- **SC-003**: Choosing run or debug for a `launch` service takes a single click, with
  no separate toggle step.
- **SC-004**: The "starting" state is visibly animated.
- **SC-005**: The "ready" and "running" states are visually distinguishable.
- **SC-006**: No existing capability is lost — start, stop, restart, run, and debug all
  remain reachable from the redesigned row.

## Assumptions

- The target user is a developer using the Run Manager panel.
- The five service statuses (stopped, starting, running, ready, crashed) are the
  existing status model and are not changed by this feature.
- Run/debug mode is chosen at launch time and is not persisted as a toggle state.
- "Start All" for a group launches each `launch` service in run mode unless a default
  is otherwise configured.
- Group-level controls ("Start All" / "Stop All") and the "+ New group" placement are
  out of scope — they are tracked separately as future features.
