import { Injectable } from '@angular/core';
import ndarray, { NdArray } from 'ndarray';
import Papa, { ParseResult } from 'papaparse';

@Injectable({
  providedIn: 'root',
})
export class CsvParserService {
  /**
   * Parses a CSV string from pose estimation into a 3D array (ndarray-like structure)
   * using the PapaParse library.
   * The output shape is (number of frames, number of bodyparts, 2 for x/y coordinates).
   *
   * @param csvString The CSV data as a string.
   * @returns A 3D array of numbers: number[][][].
   * Returns an empty array if the CSV is malformed, has no data, or PapaParse fails.
   */
  getBodyParts(csvString: string): string[] {
    const parseOutput: ParseResult<string[]> = Papa.parse(csvString.trim(), {
      dynamicTyping: false,
      skipEmptyLines: true,
    });

    if (parseOutput.errors.length > 0) {
      console.error('PapaParse errors:', parseOutput.errors);
      return [];
    }

    const allRows = parseOutput.data;

    if (allRows.length < 4) {
      console.error('CSV must have at least 3 header lines and 1 data line.');
      return [];
    }

    const bodypartsHeader = allRows[1];
    if (
      !bodypartsHeader ||
      bodypartsHeader.length <= 1 ||
      (bodypartsHeader.length - 1) % 3 !== 0
    ) {
      console.error(
        'Malformed bodyparts header line (line 2 of CSV).',
        bodypartsHeader,
      );
      return [];
    }
    return bodypartsHeader.filter((_element, index) => {
      // Check if the index is 1 (the second element)
      // OR if the index is 1 plus a multiple of 3
      // (index - 1) % 3 === 0 ensures that after the 2nd element (index 1),
      // we pick elements at index 4 (1+3), 7 (1+6), 10 (1+9), etc.
      return (index - 1) % 3 === 0 && index >= 1;
    });
  }

  parsePredictionFile(csvString: string): NdArray<Float64Array> {
    const parseOutput: ParseResult<string[]> = Papa.parse(csvString.trim(), {
      dynamicTyping: false,
      skipEmptyLines: true,
    });

    if (parseOutput.errors.length > 0) {
      console.error('PapaParse errors:', parseOutput.errors);
      return ndarray(new Float64Array(0), [0, 0, 2]); // Return empty ndarray
    }

    const allRows = parseOutput.data;

    if (allRows.length < 4) {
      console.error('CSV must have at least 3 header lines and 1 data line.');
      return ndarray(new Float64Array(0), [0, 0, 2]);
    }

    const bodypartsHeader = allRows[1];
    if (
      !bodypartsHeader ||
      bodypartsHeader.length <= 1 ||
      (bodypartsHeader.length - 1) % 3 !== 0
    ) {
      console.error(
        'Malformed bodyparts header line (line 2 of CSV).',
        bodypartsHeader,
      );
      return ndarray(new Float64Array(0), [0, 0, 2]);
    }
    const numBodyParts = (bodypartsHeader.length - 1) / 3;

    const coordsHeader = allRows[2];
    if (!coordsHeader || coordsHeader.length !== bodypartsHeader.length) {
      console.error(
        'Coordinate header (line 3 of CSV) length mismatch with bodyparts header.',
      );
      return ndarray(new Float64Array(0), [
        0,
        numBodyParts > 0 ? numBodyParts : 0,
        2,
      ]);
    }

    const dataRowsOnly = allRows.slice(3);
    const numFrames = dataRowsOnly.length;

    if (numFrames === 0 || numBodyParts === 0) {
      // If no actual data frames or no body parts identified, return an appropriately shaped empty ndarray
      return ndarray(new Float64Array(0), [numFrames, numBodyParts, 2]);
    }

    // Create a flat Float64Array to store all x, y coordinates
    // Total elements = numFrames * numBodyParts * 2 (for x and y)
    const flatData = new Float64Array(numFrames * numBodyParts * 2);
    let flatIndex = 0;

    for (let rowIndex = 0; rowIndex < numFrames; rowIndex++) {
      const values = dataRowsOnly[rowIndex];

      if (values.length < 1 + numBodyParts * 3) {
        console.warn(
          `Skipping malformed data row ${rowIndex + 4} (not enough columns): "${values.slice(0, 5).join(',')}..."`,
        );
        // Fill corresponding part of flatData with NaNs for this frame
        for (let i = 0; i < numBodyParts; i++) {
          flatData[flatIndex++] = NaN; // x
          flatData[flatIndex++] = NaN; // y
        }
        continue;
      }

      for (let bodyPartIdx = 0; bodyPartIdx < numBodyParts; bodyPartIdx++) {
        const xDataIndex = 1 + bodyPartIdx * 3;
        const yDataIndex = 1 + bodyPartIdx * 3 + 1;

        if (xDataIndex >= values.length || yDataIndex >= values.length) {
          console.warn(
            `Skipping body part ${bodyPartIdx} in data row ${rowIndex + 4} due to insufficient data.`,
          );
          flatData[flatIndex++] = NaN; // x
          flatData[flatIndex++] = NaN; // y
          continue;
        }

        const xString = values[xDataIndex];
        const yString = values[yDataIndex];

        const x = parseFloat(xString);
        const y = parseFloat(yString);

        if (isNaN(x) || isNaN(y)) {
          console.warn(
            `Could not parse x or y as number for body part ${bodyPartIdx} in data row ${rowIndex + 4}. Values: x='${xString}', y='${yString}'.`,
          );
          flatData[flatIndex++] = NaN;
          flatData[flatIndex++] = NaN;
        } else {
          flatData[flatIndex++] = x;
          flatData[flatIndex++] = y;
        }
      }
    }

    // Create the ndarray with the flat data and the desired shape
    return ndarray(flatData, [numFrames, numBodyParts, 2]);
  }
}
