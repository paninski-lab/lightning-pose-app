export interface ListBoxItem<T = any> {
  label: string;
  value: T;
  markers?: { label: string; colorClass: string }[];
  description?: string;
}
