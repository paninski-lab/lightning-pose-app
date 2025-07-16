export interface MultiView<T> {
  key: string;
  views: Record<string, T>;
}
