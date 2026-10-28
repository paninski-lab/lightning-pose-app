# Agent instructions — Lightning Pose App

This is the Cursor/agent entry point. Stack and code patterns: [CLAUDE.md](CLAUDE.md). Human setup: [CONTRIBUTING.md](CONTRIBUTING.md). Releases: [DEV.md](DEV.md).

## Product

Lightning Pose App (LPA) is research software used by 100+ labs for labeling, training, and reviewing pose estimation.

## Safety

The filesystem is the database (`~/.lightning-pose/projects.toml`, `project.yaml`, label CSVs, model dirs). Do not silently rewrite those formats. New on-disk layouts need a numbered migration in `app_server/src/litpose_app/migrations/`. If a change could lose labels or models, stop and explain.

## Git

- Commit, push, open, merge, or close PRs **only when asked**.
- Typical code changes like new features and bug fixes should happen on devoted branches, not `main`. One branch per feature or bugfix bundle; combining is fine when the changes touch the same part of the code. (See [CONTRIBUTING.md](CONTRIBUTING.md)).
- Simple docs-only edits (README, CHANGELOG, CONTRIBUTING, DEV) may be made on `main`.
- Version bump + CHANGELOG.md notes: after they are on `main`, release with `./scripts/publish_github_release.sh`. Do not tag or release from a feature branch.

## Dev loop

```bash
honcho -f Procfile.dev start   # UI at http://localhost:4200, hot reload
```

`litpose run_app` is production-shaped (compiled UI). Use `--host 0.0.0.0` on cloud machines; run `./scripts/build/build_ui.sh` first. Honcho compiles the UI in memory and does not fill `ngdist`.

On this team's Lightning Studio, a new shell puts Node 22 on `PATH`. Select Node 26 in that terminal before UI commands (`nvm use 26`, then clear any `node` / `npm` / `npx` shell functions). See [DEV.md](DEV.md).

## UI

DaisyUI 5 (`dim` in `web_ui/src/styles.css`) is the component style. Use DaisyUI classes before custom CSS. Put a widget in `web_ui/src/app/components/` when it is reused or has its own behavior, and add a `*.stories.ts` beside it. Leave feature-only UI next to the feature (for example `video-player/`). Do not wrap a one-off DaisyUI button in a new component. Storybook: `cd web_ui && npm run storybook` (http://localhost:6006), with Node 26 on `PATH`. Storybook is for looking at the widget. It does not replace unit tests.

The Viewer frame and time fields stay custom (`.jump-field`). DaisyUI `input` is too tall for that bar. The seek slider uses DaisyUI `range`.

## Tests

Write or update tests in the same change as the behavior. A spec should fail when something a user does breaks, not when wording changes. A control renamed in its role or `aria-label`, or a changed shortcut, needs the spec updated to match. A change to tip, button, or help wording alone needs no test.

- Backend: `cd app_server && pytest --ignore=tests/test_predict_wrapper.py`. Skip `test_predict_wrapper.py` unless you mean to; it needs a GPU-oriented env and is excluded from CI.
- UI you touched: `cd web_ui && npx ng lint` and a targeted `npx ng test --no-watch --browsers=ChromeHeadless --include=<spec>`. Run the full UI suite when the change is shared (a component under `components/`, global styles, or keyboard/routing used by more than one page).
- Prefer specs next to the code (`*.spec.ts`). Assert what a user can do: clicks, keyboard, typed frame/time, slider bounds. Query by role or `aria-label`. Do not assert `data-tip` text, button copy, or class lists unless that text or class is the fix.
- Delete a spec that only covered a method which moved to a child. Do not keep a parent test alive with stubs for behavior the parent no longer owns. For a parent with heavy children, stub those children (`TestBed.overrideComponent`), as in `labeler-page.component.spec.ts`.
- Components that use `ProjectInfoService` must mock it. Do not let tests hit the real router resolver or RPC client.

When you describe the change in [CHANGELOG.md](CHANGELOG.md), [BUGS.md](BUGS.md), or a `feature_plans/*.md` note, name the test that covers it (file, and the behavior it checks). A user-facing bullet without a corresponding test note is incomplete. For a wording-only change, the note says so ("wording only, no test").

## Tools

Do not install or enable additional tools unless asked.

# Frontend Architecture & Modern Angular Standards

Lightning Pose App's UI (`web_ui/`) is built on modern Angular (v20+), Tailwind CSS 4, and DaisyUI 5. Code must follow modern Angular idioms, prioritizing signals, modularity, and high testability.

This section is the frontend standard. It includes every rule in [`web_ui/docs/context.md`](web_ui/docs/context.md) (Karan Sikka's guidance); if the two ever disagree, follow `context.md` and fix this section. `CLAUDE.md` holds stack facts and gotchas, not style rules.

New and edited code follows this standard. Do not rewrite untouched legacy code inside a feature PR; that is #157.

## TypeScript

- Use strict type checking.
- Prefer type inference when the type is obvious.

## Component Architecture & Boundaries

- **Smart (Container) Components**:
  - Live in domain/feature directories (`src/app/viewer/`, `src/app/labeler/`, `src/app/video-player/`, `src/app/project-settings/`).
  - Coordinate services (`SessionService`, `RpcService`, `ProjectInfoService`), manage feature-level state, and orchestrate user flows.
  - Pass state down to child components via signal inputs and react to events via outputs.
- **Dumb (Presentational) Components**:
  - Live in `src/app/components/` when reusable across features, or as child subcomponents within a feature directory when feature-specific.
  - Purely presentational: communicate strictly through signal inputs (`input()`, `input.required()`), two-way models (`model()`), and event outputs (`output()`).
  - Prefer presentational components that get data through inputs. A reusable picker that must load its own data may inject `RpcService`, `SessionService`, or `ProjectInfoService` (for example `path-editable`, `server-video-picker`, `base-session-picker`, `directory-viewer`, `video-group-import`, `active-task-indicator`).
  - Reusable components under `components/` **must** have a companion Storybook story (`*.stories.ts`).
- **Single Responsibility & Collocation**:
  - Keep components small and focused on a single concern.
  - Collocate files: `foo.component.ts`, `foo.component.html`, `foo.spec.ts`, and optionally `foo.stories.ts` side-by-side.
  - Prefer inline templates (`template: ...`) for small components (< 30 lines of HTML). Use external template files for larger markup, with paths relative to the component `.ts` file.
  - Do not create a new component to wrap a trivial DaisyUI element (e.g. a simple button or badge).

## Modern Angular Patterns (Angular v20+)

- **Standalone Components & OnPush**:
  - All components, directives, and pipes are standalone (default in Angular v20+; do not specify `standalone: true`).
  - Always use `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- **Signal Inputs, Outputs, and Models**:
  - Use `input()` and `input.required()` instead of `@Input()`.
  - Use `output()` instead of `@Output()` / `new EventEmitter()`.
  - Use `model()` for two-way bindings (replaces `@Input()` + `@Output()` pairs).
- **Signal Queries**:
  - Use `viewChild()` and `viewChildren()` instead of `@ViewChild` and `@ViewChildren`.
- **Reactivity & Derived State**:
  - Use `signal()` for writable local state. Always update via `.set(...)` or `.update(...)` (never mutate objects in-place).
  - Use `computed()` for pure derived values. Keep computations synchronous, side-effect free, and deterministic.
  - Use `linkedSignal()` when a piece of writable state must reset or re-derive whenever another signal or input changes.
  - Avoid `effect()` for state synchronizations; reserve `effect()` exclusively for imperative side-effects (e.g., logging, manual DOM interactions, external canvas/audio APIs).
- **Modern Templates & Control Flow**:
  - Use native block control flow: `@if`, `@else if`, `@else`, `@switch`, `@case`, and `@for (...; track ...)`. Never use `*ngIf`, `*ngFor`, or `*ngSwitch`.
  - Always provide an explicit track expression in `@for` (e.g. `track item.id` or `track item.name`).
  - Use `@let` syntax for template variable aliases instead of complex repeated expressions or `*ngIf="expr as val"` workarounds.
  - Use native property bindings for styling: `[class.active]="isActive()"`, `[class]="classString()"`, `[style.width.px]="width()"`. Do not use `ngClass` or `ngStyle`.
  - Do NOT use `@HostBinding` or `@HostListener` decorators. Define host bindings and event listeners inside the component decorator's `host` object.
  - Keep templates simple. Do not assume globals such as `new Date()` are available in templates.
- **Forms**:
  - Prefer Reactive forms over template-driven ones for new forms. Existing template-driven `ngModel` bindings (for example the View options sliders) stay unless the PR is about that form.
  - Do not adopt Angular's experimental Signal Forms yet.
- **Dependency Injection**:
  - Always use the `inject()` function instead of constructor parameter injection.
- **Subscriptions**:
  - End manual subscriptions with `takeUntilDestroyed()`, or expose the stream with `toSignal()`.
- **Security**:
  - Never set `innerHTML` or call `bypassSecurityTrust*` with user or file data. The one `innerHTML` use (`highlight.directive.ts`) sets highlight.js output, which escapes its input.

## State Management Stack

- **Local State**: Component-level `signal()` and `computed()`. Keep state transformations pure and predictable.
- **Feature / Shared State**:
  - Use a service for signal state that is reused across components.
  - Use `signal()` for simple state and ngrx `signalState` (`@ngrx/signals`) for complex state. Do not use ngrx store. `@ngrx/signals` is installed; no code uses it yet.
- **Services**:
  - Design each service around a single responsibility.
  - Use `providedIn: 'root'` for singleton services.
  - Provide a service at a component when its state belongs to that view, so each page gets a fresh instance (for example `EnabledViewsKeypointsService` at `ViewerPageComponent`).
- **Async Event Streams & Bridging**:
  - Use RxJS `Subject` / `BehaviorSubject` for event-driven streams, debouncing, polling, or WebSocket/SSE connections, and `BehaviorSubject` for synchronous event-driven logic (`effect()` runs asynchronously).
  - Use `toSignal()` to expose RxJS observable streams to signal-based templates and computed properties.
  - Use `toObservable()` when bridging signal values into RxJS operators.

## Styling & Theme

- **DaisyUI 5 & Tailwind 4**:
  - LPA uses DaisyUI 5 with the `dim` theme (`web_ui/src/styles.css`).
  - Prefer DaisyUI component classes (`btn`, `input`, `range`, `select`, `badge`, `modal`, `card`, `tooltip`) before custom CSS.
  - Use Tailwind CSS 4 utility classes for flexbox, grid, spacing, and alignment.
  - Exceptions: The Viewer frame and time fields stay custom (`.jump-field`) because DaisyUI `input` is too tall for that tight toolbar. The seek slider uses DaisyUI `range`.

## Reference files

- **Component pattern:** `web_ui/src/app/labeler/image-label-widget/image-label-widget.component.ts` (signals, `inject`, modern control flow).
- **RxJS / signal bridge:** `web_ui/src/app/video-player/video-player-state.ts`.
- **API structure:** `web_ui/src/app/session.service.ts` (centralized data logic).

## Testing Signal Components

- **Signal Inputs in Specs**: Set signal inputs using `fixture.componentRef.setInput('propName', value)`.
- **Mocks & Isolation**: Mock `ProjectInfoService`, `RpcService`, and `SessionService` in unit tests. Never make live network or RPC calls in tests.
- **User-Centric Assertions**: Query elements by accessibility role, label, or data attribute. Assert disabled states, emitted outputs, and keyboard behavior. Assert visible text or classes only when they are the behavior (for example an error message or the `text-error` state).

## Curated Angular References

- [Angular Documentation Overview](https://angular.dev/overview)
- [Angular Full LLM Guide (`llms-full.txt`)](https://angular.dev/assets/context/llms-full.txt)
- [Signals & Reactive Primitives](https://angular.dev/guide/signals)
- [Signal Inputs & Outputs](https://angular.dev/guide/components/inputs)
- [Template Control Flow](https://angular.dev/guide/templates/control-flow)
- [Dependency Injection (`inject`)](https://angular.dev/guide/di)
- [RxJS Signal Interop](https://angular.dev/ecosystem/rxjs-interop)
- [Angular Testing Guide](https://angular.dev/guide/testing)

