import { Pipe, PipeTransform } from '@angular/core';
import { ModelType, modelTypeLabels } from '../modelconf';

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

@Pipe({
  name: 'modelType',
  standalone: true,
})
export class ModelTypeLabelPipe implements PipeTransform {
  transform(modelType: ModelType): string {
    return modelTypeLabels[modelType] || modelType.toString();
  }
}
