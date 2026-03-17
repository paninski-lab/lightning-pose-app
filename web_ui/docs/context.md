You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, and performant code following Angular and TypeScript best practices.
## TypeScript Best Practices
- Use strict type checking
- Prefer type inference when the type is obvious

## Angular Best Practices
- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
### Components
- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.
## State Management
- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Use Services for signal state that is re-used across components. Provided at component level.
- Use signal for simple state, and ngrx signalState for complex state.
- Do not use ngrx store
- Use rxjs BehaviorSubject for synchronous event-driven sync logic (effect is asynchronous).
## Templates
- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Do not assume globals like (`new Date()`) are available in templates.
## Services
- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection
## Styling
- Prioritize using DaisyUI component classes

## 6. Gold Standard Reference Files
* **Component Pattern:** `src/app/labeler/image-label-widget/image-label-widget.component.ts` (Signals, `inject`, modern flow).
* **Hybrid Logic:** `src/app/components/video-player/video-player-state.ts` (RxJS/Signal bridge).
* **API Structure:** `src/app/session.service.ts` (Centralized data logic).
