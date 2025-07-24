import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'path',
  standalone: true,
})
export class PathPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }
    return value.replace(/\//g, ' / ');
  }
}
