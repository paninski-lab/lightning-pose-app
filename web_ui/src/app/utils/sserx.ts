import { Observable, Observer } from 'rxjs';

/**
 * Creates an observable stream of events from a specified Server-Sent Events endpoint.
 * @param endpoint The specific SSE endpoint to connect to (e.g., '/sse').
 * @returns An Observable that emits the data from each SSE message as a T.
 */
export function getEventStream(endpoint: string): Observable<any> {
  // We return a new Observable that will manage the EventSource connection.
  return new Observable((observer: Observer<string>) => {
    // Check if EventSource is available in the browser.
    if (typeof EventSource === 'undefined') {
      observer.error('EventSource is not supported by this browser.');
      return;
    }

    const eventSource = new EventSource(`${endpoint}`);

    // --- Event Handlers ---

    // 1. onmessage: This is triggered when a message without a specific 'event' name is received.
    //    This is the most common case.
    eventSource.onmessage = (event: MessageEvent) => {
      console.log('Received SSE message:', event.data);
      observer.next(JSON.parse(event.data));
    };

    // 2. onerror: This is triggered when an error occurs with the connection.
    eventSource.onerror = (error: any) => {
      console.error('SSE Error:', error);
      // When an error occurs, we can decide whether to close the stream.
      // If the readyState is CLOSED, it means the connection was lost for good.
      if (eventSource.readyState === EventSource.CLOSED) {
        observer.error('SSE connection closed by server.');
      } else {
        // You could implement retry logic here if desired.
        observer.error(error);
      }
    };

    // --- Teardown Logic (Crucial for Cleanup) ---
    // This function is returned by the Observable constructor.
    // It will be called automatically when a subscriber unsubscribes.
    return () => {
      console.log('Closing SSE connection.');
      eventSource.close();
    };
  });
}
