declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data: object) => void;
      identify: (data: object) => void;
    };
  }
}

export {};
