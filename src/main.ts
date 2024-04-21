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

/**
 * Calculate the rebalance of `initialSum` while adding `sumToAdd`
 * @param sumInitial The initial value of the sum
 * @param allocInitial The initial allocation of the sum. Array of numbers between 0 and 1, inclusive
 * @param allocTargets The target allocation. Array of numbers between 0 and 1, inclusive
 * @param sumToAdd The value to add to `initialSum`
 * @returns A subdivision of `sumToAdd` that permits to rebalance `sumInitial` while adding `sumToAdd`. Can contains negative values, meaning that asset must be sold.
 */
function rebalance(sumInitial: number, allocInitial: readonly number[], allocTargets: readonly number[], sumToAdd: number): number[] {
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
 * @param sumInitial The initial value of the sum
 * @param allocInitial The initial allocation of the sum. Array of numbers between 0 and 1, inclusive
 * @param allocTargets The target allocation. Array of numbers between 0 and 1, inclusive
 * @param sumToAdd The value to add to `initialSum`
 * @returns A subdivision of `sumToAdd` that permits to rebalance `sumInitial` while adding `sumToAdd`. Contains only values >= 0, meaning that no asset has to be sold.
 */
function rebalanceWithoutNegativeRebalancing(sumInitial: number, allocInitial: readonly number[], allocTargets: readonly number[], sumToAdd: number): number[] {

    // Calculate a subdivision of `sumToAdd`, but keep track of the negative rebalancings and the indexes that remains > 0
    let sumNegativeRebalacings = 0
    const indexesRedistribution = new Set<number>()
    const sumDivided = new Array<number>(allocTargets.length).fill(NaN)
    allocTargets.forEach((value, index) => {

        // Calculate the subdivison of `sumToAdd` adding the rebalancing (positive or negative) to make `sumInitial` subdivided like `allocTargets`
        const sumToAddSuddivision = ((value - allocInitial[index]) * sumInitial) + (value * sumToAdd);

        if (sumToAddSuddivision <= 0) {
            // Keep track of the negative subdivision. The result of the subdivision is already 0
            sumDivided[index] = 0;
            sumNegativeRebalacings += sumToAddSuddivision;
        } else {
            // Save the positive subdivision, and keep track of the index that will be used to rebalance the negative subdivisions
            sumDivided[index] = sumToAddSuddivision;
            indexesRedistribution.add(index)
        }
    })

    if (sumNegativeRebalacings < 0) {
        // Redistribute negative rebalancings to other assets

        let reimainingToDistribute = sumNegativeRebalacings;

        while (reimainingToDistribute < 0 && indexesRedistribution.size > 0) {
            //At every loop divide evenly the remaining sum to distribute to all redistribution indexes
            const remainingSingleRedistributedRebalancing = reimainingToDistribute / indexesRedistribution.size;

            for (const indexToRedistribute of indexesRedistribution) {
                // Calculate the effect of distribution
                const distributeEffect = sumDivided[indexToRedistribute] + remainingSingleRedistributedRebalancing;

                if (distributeEffect >= 0) {
                    // The distribution isn't negative and can be applied
                    sumDivided[indexToRedistribute] = distributeEffect;
                    // Reduce remaining value to distribute
                    reimainingToDistribute -= remainingSingleRedistributedRebalancing
                } else {
                    // The distribution is negative and subdivision of `sumToAdd` is 0
                    sumDivided[indexToRedistribute] = 0;
                    // Reduce remaining value to distribute, but only by the difference
                    reimainingToDistribute -= (remainingSingleRedistributedRebalancing - distributeEffect)
                }

                // Remove indexes from the set of indexes used for redistribution, if its relative subdivision is no more positive
                if (sumDivided[indexToRedistribute] <= 0) indexesRedistribution.delete(indexToRedistribute)

                // Exit the for if the remaining quantity to redistribute is no longer negative
                if (reimainingToDistribute >= 0) break;
            }
        }
    }

    return sumDivided;
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
        {name: "Etf azionari", value: 6000, allocationTarget: 0.7},
        {name: "Fondi pensione", value: 5000, allocationTarget: 0.2},
        {name: "Obbligazioni", value: 3000, allocationTarget: 0.1},
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

    const sumDividedWithoutNegativeRebalancings = rebalanceWithoutNegativeRebalancing(sumInitial, allocInitial, allocTargets, sumToAdd)
    console.log()
    console.log(`------ Results without negative rebalancings ------`)
    displayResults(inputs, sumDividedWithoutNegativeRebalancings, allocInitial)
}

main()
