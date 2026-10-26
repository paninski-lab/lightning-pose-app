import { lpOnlyImageFormat, lpOnlyImageMessage } from './image-formats';

describe('lpOnlyImageFormat', () => {
  it('names formats LP reads but the browser cannot show, in any case', () => {
    expect(lpOnlyImageFormat('labeled-data/s/img0001.tif')).toBe('TIFF');
    expect(lpOnlyImageFormat('labeled-data/s/img0001.TIFF')).toBe('TIFF');
    expect(lpOnlyImageFormat('labeled-data/s/img0001.jp2')).toBe('JPEG 2000');
  });

  it('is null for formats the browser shows and for names without an extension', () => {
    expect(lpOnlyImageFormat('labeled-data/s/img0001.JPG')).toBeNull();
    expect(lpOnlyImageFormat('labeled-data/s/img0001.webp')).toBeNull();
    expect(lpOnlyImageFormat('labeled-data/s.tif/img0001')).toBeNull();
  });

  it('matches the backend wording', () => {
    expect(lpOnlyImageMessage('TIFF')).toBe(
      'TIFF frames train in Lightning Pose but cannot be shown in the browser. Convert them to PNG to label or review them here.',
    );
  });
});
