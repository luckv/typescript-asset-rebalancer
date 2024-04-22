#!/usr/bin/env ts-node

import assert from "node:assert";

/**
 * https://en.wikipedia.org/wiki/Kahan_summation_algorithm
 * @param arr
 */
function kahanSum(arr: readonly number[]): number {
    if (arr.length === 0) return 0;

    let s = arr[0];
    let r = 0;

    for (const v of arr.slice(1)) {
        const t1 = v - r;
        const t2 = s + t1;
        r = (t2 - s) - t1;
        s = t2;
    }

    return s;
}

function truncate(x: number, decimals?: number): number {
    if (decimals === undefined)
        return Math.trunc(x)

    assert(Number.isInteger(decimals), "decimals must be an integer");

    const tenPow = Math.pow(10, decimals);
    return Math.trunc(x * tenPow) / tenPow;
}

function calculateAllocation(arr: readonly number[]): [number, number[]] {
    const sum = kahanSum(arr);
    return [sum, arr.map(v => v / sum)];
}

/**
 * Calculate the rebalance of `initialSum` while adding `sumToAdd`
 * @param sumInitial The initial value of the sum
 * @param allocInitial The initial allocation of the sum. Array of numbers between 0 and 1, inclusive
 * @param allocTargets The target allocation. Array of numbers between 0 and 1, inclusive
 * @param sumToAdd The value to add to `initialSum`
 * @returns A subdivision of `sumToAdd` that permits to rebalance `sumInitial` while adding `sumToAdd`. Can contains negative values, meaning that asset must be sold.
 */
function rebalance(sumInitial: number, allocInitial: readonly number[], allocTargets: readonly number[], sumToAdd: number): number[] {
    assert(allocInitial.length === allocTargets.length, "Arguments must be arrays with same length")

    return allocTargets.map<number>((value, index) => {
        // Calculate the subdivison of `sumToAdd` adding the rebalancing (positive or negative) to make `sumInitial` subdivided like `allocTargets`
        // First calculate how to rebalance `initialSum`, then apply the balanced allocation to `sumToAdd`
        // How much is needed to rebalance current sum is: (value - allocInitial[index]) * sumInitial
        // How much is the balanced allocation to sumToAdd is: value * sumToAdd
        return (value - allocInitial[index]) * sumInitial + (value * sumToAdd)
    })
}

/**
 * Calculate the rebalance of `initialSum` while adding `sumToAdd`, but without selling assets.
 * @param sumsInitial The initial sums of each asset
 * @param allocTargets The target allocation. Array of numbers between 0 and 1, inclusive
 * @param sumToAdd The value to add to `initialSum`
 * @returns A subdivision of `sumToAdd` that permits to rebalance `sumInitial` while adding `sumToAdd`. Contains only values >= 0, meaning that no asset has to be sold.
 */
function rebalanceWithoutNegativeRebalancing(sumsInitial: readonly number[], allocTargets: readonly number[], sumToAdd: number): number[] {
    assert(sumsInitial.length === allocTargets.length, "Arguments must be arrays with same length")

    const [sumInitial, allocInitial] = calculateAllocation(sumsInitial);

    const sumFinal = sumInitial + sumToAdd;
    const sumFinalDivided = allocTargets.map(a => a * sumFinal)
    const sumFinalDividedDiffInitial = sumFinalDivided.map((s, i) => s - allocInitial[i] * sumInitial).map(s => s < 0 ? 0 : s)

    const [_, diffAllocation] = calculateAllocation(sumFinalDividedDiffInitial);

    return diffAllocation.map(d => d * sumToAdd);
}

function displayResults(inputs: readonly Allocation[], sumsDivided: readonly number[], allocInitial: readonly number[]) {

    assert(inputs.length === sumsDivided.length && allocInitial.length === inputs.length, "Arguments must be arrays with same length")

    const allocFinalSums = inputs.map((input, index) => input.value + sumsDivided[index])
    const sumFinal = kahanSum(allocFinalSums);
    const allocFinal = allocFinalSums.map((value) => value / sumFinal)

    console.log(`Final sum: ${sumFinal}`)
    console.table(inputs.map((input, index) => ({
        name: input.name,
        sumToAdd: truncate(sumsDivided[index], 2),
        sumFinal: truncate(allocFinalSums[index], 2),
        allocationTarget: input.allocationTarget,
        allocationInitial: truncate(allocInitial[index], 3),
        allocationFinal: truncate(allocFinal[index], 3),
    })))

}

type Allocation = { name: string, value: number; allocationTarget: number }

function main(){

    // Edit `inputs` and `sumToAdd` and then execute the script

    const inputs: readonly Allocation[] = [
        {name: "Etf azionari", value: 6000, allocationTarget: 0.3},
        {name: "Fondi pensione", value: 5000, allocationTarget: 0.5},
        {name: "Obbligazioni", value: 6000, allocationTarget: 0.2},
    ];
    const sumToAdd = 10000;

    const allocInitialSums = inputs.map(i => i.value)
    const allocTargets = inputs.map(i => i.allocationTarget)

    //Check data are valid
    assert(inputs.length >= 2, "Allocation must be composed at least 2 elements");
    assert(inputs.every(s => s.value >= 0), "Initial allocated values can't be < 0")
    assert(inputs.every(s => s.allocationTarget >= 0 && s.allocationTarget <= 1), "Allocation target values must be between 0 and 1, inclusive")
    assert(kahanSum(allocTargets) === 1.0, `Allocation targets sum must be 1. Is ${kahanSum(allocTargets)}`)
    assert(sumToAdd > 0, "Sum to add must be > 0")

    const sumInitial = kahanSum(allocInitialSums);
    const allocInitial = allocInitialSums.map((value) => value / sumInitial)

    console.log(`Initial allocated sums (total: ${sumInitial})`)
    console.table(inputs)
    console.log(`Sum to add: ${sumToAdd}`)

    const sumsDivided = rebalance(sumInitial, allocInitial, allocTargets, sumToAdd)
    console.log()
    console.log(`------ Results with negative rebalancings ------`)
    displayResults(inputs, sumsDivided, allocInitial)

    const sumDividedWithoutNegativeRebalancings = rebalanceWithoutNegativeRebalancing(allocInitialSums, allocTargets, sumToAdd)
    console.log()
    console.log(`------ Results without negative rebalancings ------`)
    displayResults(inputs, sumDividedWithoutNegativeRebalancings, allocInitial)
}

main()
