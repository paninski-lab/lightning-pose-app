import { mc_util, ModelListResponseEntry } from './modelconf';

describe('mc_util', () => {
  it('should return createdAt for normal models from config', () => {
    const entry: ModelListResponseEntry = {
      model_name: 'test',
      model_relative_path: 'test',
      model_kind: 'normal',
      config: {
        creation_datetime: '2023-01-01T00:00:00Z',
      } as any,
    };
    const util = new mc_util(entry);
    expect(util.createdAt).toBe('2023-01-01T00:00:00Z');
  });

  it('should return createdAt for eks models from ensemble_config', () => {
    const entry: ModelListResponseEntry = {
      model_name: 'test-eks',
      model_relative_path: 'test-eks',
      model_kind: 'eks',
      ensemble_config: {
        creation_datetime: '2023-01-02T00:00:00Z',
      } as any,
    };
    const util = new mc_util(entry);
    expect(util.createdAt).toBe('2023-01-02T00:00:00Z');
  });

  it('should return undefined if creation_datetime is missing', () => {
    const entry: ModelListResponseEntry = {
      model_name: 'test',
      model_relative_path: 'test',
      model_kind: 'normal',
      config: {} as any,
    };
    const util = new mc_util(entry);
    expect(util.createdAt).toBeUndefined();
  });
});
