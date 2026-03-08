# Context

## 1. Core Tech Stack & Strictness
* **Framework:** Use **Angular v21.1.3**. Always prioritize the latest stable APIs.
* **TypeScript:** Adhere to `strict: true`. **Handle `null` and `undefined` explicitly** in all logic. Follow `strictTemplates` and `strictInjectionParameters`.
* **Styling:** Use **Tailwind CSS v4.1.7** with **DaisyUI v5.1.12**. 
    * Prioritize DaisyUI component classes (e.g., `btn`, `card`) over long utility strings.
* **Architecture:** Components are **Standalone by default** (Angular v19+). Do not include `standalone: true` in decorators. **Do not suggest or create `NgModule` files.**

## 2. Mandatory Reactivity Patterns
* **Primary State:** Use **Angular Signals** (`signal`, `computed`, `effect`) for all UI state and derived data.
* **Event Streams:** Use **RxJS** (`BehaviorSubject`, `Observable`) **only** for complex asynchronous coordination (e.g., video timing/sync) and HTTP data flows.
* **Bridge Strategy:** Convert RxJS streams to Signals using `toSignal()` for template consumption.
* **Template Syntax:** Use modern `@if`, `@for`, and `@switch` control flow exclusively. **Do not use `*ngIf` or `*ngFor`.**
* **Component I/O:** Use signal-based `input()`, `model()` for two-way binding, and `output()` functions.
* **Dependency Injection:** Use the `inject()` function at the class level. **Strictly avoid constructor injection.**

## 3. Directory & API Standards
* **Core Logic:** Keep global logic (RPC, Config) in the root `/app` directory. 
* **Shared UI:** Place reusable building blocks (e.g., `zoomable-content`, `keypoint-container`) in `/app/components`.
* **Feature Domains:** Group by feature: `/app/labeler`, `/app/viewer`, `/app/models-page`, `/app/project-home-page`.
* **Data Fetching:** * Use **`RpcService`** (wrapping `HttpClient`) for JSON-RPC.
    * Use native **`fetch`** only for specialized requests (e.g., log retrieval).
    * Centralize shared API logic in **`SessionService`**.

## 4. State & Service Locality
* **Global Context:** Use `ProjectInfoService` and `SessionService` for app-wide state.
* **Local Context:** Provide feature-specific services (e.g., `LabelerViewOptionsService`) at the **Component level** (via `providers: [...]` in the decorator) rather than `providedIn: 'root'`. This ensures state is reset when the component is destroyed.

## 5. Testing & Documentation
* **Unit Testing:** Implement meaningful tests in `.spec.ts` files. Include deep logic assertions and mock all HTTP/RPC dependencies using Jasmine. **No skeleton tests.**
* **Documentation:** Use **JSDoc** for all utility functions and public service methods. Use descriptive `camelCase` naming.

## 6. Gold Standard Reference Files
* **Component Pattern:** `src/app/labeler/image-label-widget/image-label-widget.component.ts` (Signals, `inject`, modern flow).
* **Hybrid Logic:** `src/app/components/video-player/video-player-state.ts` (RxJS/Signal bridge).
* **API Structure:** `src/app/session.service.ts` (Centralized data logic).
