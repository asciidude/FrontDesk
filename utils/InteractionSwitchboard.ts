export class InteractionSwitchboard {
    activeCollectors: Set<any>;

    constructor(client: any) {
        this.activeCollectors = new Set();

        client.on('interactionCreate', async (interaction: any) => {
            for (const collector of this.activeCollectors) {
                await collector.processInteraction(interaction);
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