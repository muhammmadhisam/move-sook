import type { ZipCode } from "./types";

export function binarySearchByZipCode<Arr extends ZipCode[], Key extends keyof ZipCode>(
  arr: Arr,
  key: Key,
  target: Arr[number][Key]
): Arr {
  let left = 0;
  let right = arr.length - 1;
  const arrLength = arr.length;
  const results: Arr = [] as unknown as Arr;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const currentObj = arr[mid];

    if (!currentObj) {
      break;
    }

    if (currentObj[key] === target) {
      // Found a matching object, add it to the results
      results.push(currentObj);
      let leftPointer = mid - 1;
      while (leftPointer >= 0) {
        const leftItem = arr[leftPointer];
        if (!leftItem || leftItem[key] !== target) break;
        results.push(leftItem);
        leftPointer -= 1;
      }
      let rightPointer = mid + 1;
      while (rightPointer < arrLength) {
        const rightItem = arr[rightPointer];
        if (!rightItem || rightItem[key] !== target) break;
        results.push(rightItem);
        rightPointer += 1;
      }
      return results;
    } else if (currentObj[key] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  // No matching objects found
  return results;
}
