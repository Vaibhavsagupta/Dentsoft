function formatQuadString(slots, activeList) {
    if (!activeList || activeList.length === 0) return '';
    let res = '';
    for (const n of slots) {
        if (activeList.includes(n)) {
            res += n;
        } else {
            // Check if there are active teeth before and after this slot
            res += ' ';
        }
    }
    return res.trim();
}

console.log('LR [7, 6, 2, 1]:', `"${formatQuadString([8,7,6,5,4,3,2,1], [7,6,2,1])}"`);
console.log('LL [1, 2, 6]:', `"${formatQuadString([1,2,3,4,5,6,7,8], [1,2,6])}"`);
console.log('UL [2, 3, 4, 5]:', `"${formatQuadString([1,2,3,4,5,6,7,8], [2,3,4,5])}"`);
