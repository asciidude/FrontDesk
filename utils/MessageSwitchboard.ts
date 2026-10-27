export class MessageSwitchboard {
    activeCollectors: any;

    constructor(client: any) {
        this.activeCollectors = new Set();

        client.on('message', (msg: any) => {
            for(const collector of this.activeCollectors) {
                collector.processMessage(msg);
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