const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));

export async function processBatches<T>(
    items: T[],
    action: (item: T) => Promise<void>,
    batchSize = 5
) {
    const failures: Array<{ item?: T; error: unknown }> = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        const results = await Promise.allSettled(
            batch.map(action)
        );

        results.forEach((result, index) => {
            if (result.status === "rejected") {
                failures.push({
                    item: batch[index],
                    error: result.reason
                });
            }
        });

        if (i + batchSize < items.length) {
            await sleep(1000);
        }
    }

    if (failures.length) {
        throw new AggregateError(
            failures.map(f => f.error),
            `${failures.length} operations failed`
        );
    }
}