export class InteractionSwitchboard {
    activeCollectors: Set<any>;

    constructor(client: any) {
        this.activeCollectors = new Set();

        client.on('interaction', async (i: any) => {
            for (const collector of this.activeCollectors) {
                await collector.processInteraction(i);
            }
        });
    }

    register(collector: any) {
        this.activeCollectors.add(collector);
    }

    unregister(collector: any) {
        this.activeCollectors.delete(collector);
    }
}