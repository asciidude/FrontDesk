/**
 * Split a string into parts every n characters
 * @param str The string you want to segment
 * @param n The number of characters before splitting
 */
export const splitString = (str: string, n: number) => {
    let segments = [];
    
    for(let i = 0; i < str.length; i += n) {
        segments.push(str.slice(i, i + n));
    }

    return segments;
}