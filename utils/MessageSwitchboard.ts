export class MessageSwitchboard {
    activeCollectors: any;

    constructor(client: any) {
        this.activeCollectors = new Set();

        client.on('message', async (msg: any) => {
            for(const collector of this.activeCollectors) {
                await collector.processMessage(msg);
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