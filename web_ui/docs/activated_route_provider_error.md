### Analysis of Failing Angular Tests

After investigating the codebase and running targeted tests, I have identified the root causes for the test failures.

#### 1. "Activated Provider Error" (NG0201)
The "activated provider error" mentioned in the issue is the Angular error `NG0201: No provider found for ActivatedRoute`.
- **Cause:** Several standalone components (e.g., `ProjectHomePageComponent`, `HomePageComponent`) import `RouterLink` in their `@Component` metadata. In Angular, `RouterLink` requires an `ActivatedRoute` to be provided in the environment.
- **Evidence:** Running `npm test -- --include=src/app/project-home-page/project-home-page.component.spec.ts` confirms this failure during `fixture.detectChanges()`.
- **Why it happens:** The current unit test setup for these components uses `TestBed.configureTestingModule({ imports: [ComponentUnderTest] })` but fails to provide the necessary routing context (e.g., via `provideRouter([])` or `RouterTestingModule`).

#### 2. Real HTTP Requests in Tests
The suspicion that tests are making real HTTP requests is **correct**.
- **Cause:** 
    - `ProjectInfoService` and `SessionService` are global singletons (`providedIn: 'root'`) that inject `RpcService`.
    - `RpcService` injects the standard `HttpClient` and makes POST requests to `/app/v0/rpc/...`.
    - Components like `HomePageComponent` call `projectInfo.fetchProjects()` in their `ngOnInit`.
- **Evidence:** Running `HomePageComponent` tests shows console errors: `Http failure response for http://localhost:9876/app/v0/rpc/listProjects: 404 Not Found`. This proves the `HttpClient` is attempting to reach a backend server that doesn't exist in the test environment.
- **Route Resolvers:** The `app.routes.ts` defines a `contextResolver` that calls `ProjectInfoService.fetchContext()`. This resolver is designed to perform blocking HTTP calls to fetch project and global metadata. While unit tests for individual components don't usually trigger the router, any test that uses `provideRouter` with the real routes or navigates using the `Router` will trigger these real HTTP requests.

#### 3. "Activated" Provider / Context Getters
The "context getters defined in routes" refers to the `contextResolver` in `app.routes.ts`. 
- This resolver is critical because it populates the `ProjectInfoService` state.
- If a test environment attempts to resolve a route (e.g., during a full-app integration test or a component test that mocks the router but doesn't mock the resolver), it will fail because the environment (Karma/Chrome) cannot fulfill the RPC calls defined in `fetchContext`.

### Summary of Findings
- **Confirmed:** Tests are failing due to missing `ActivatedRoute` providers in component unit tests.
- **Confirmed:** Real HTTP requests are being attempted because `HttpClient` is provided but not mocked with `HttpTestingController` or intercepted.
- **Root Cause:** The test setup for components and services lacks the necessary mocks for routing and backend communication, causing them to fall back to real (and failing) implementations.

### Recommended Fix (Informational)
To resolve these without changing application logic, the tests should:
1. Use `provideRouter([])` or `RouterTestingModule` in `TestBed` to fix the `ActivatedRoute` error.
2. Use `provideHttpClientTesting()` and mock the RPC responses to prevent real HTTP calls.
3. Mock `ProjectInfoService` or `RpcService` directly in component tests to isolate them from service-level logic.
