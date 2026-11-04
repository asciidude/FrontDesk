export interface QueueItem {
    userId: string;
    channelId: string; // the user's dm channel
    messageId: string;
    content: string;
    command: string | null;
    timestamp: number;
}

export class DMQueue {
    commandQueue = new Map<string, QueueItem[]>();
    messageQueue = new Map<string, QueueItem[]>();

    /**
     * Add a message or command to the queue. Messages are transmitted, commands are executed.
     * @param item The item you would like to add into the queue
     */
    async queueAdd(item: QueueItem) {
        
    }

    /**
     * Remove a message or command from the queue.
     * @param item The item you would like to remove from the queue.
     */
    async queueRemove(item: QueueItem) {

    }

    /**
     * Execute the commands or transmit the messages in the queue, then remove it.
     */
    async execQueue() {

    }
}
/*
    functions needed:
    const user: any = await bot.api('POST', `/users/${userId}/dm`);
    const channel: any = await bot.api('GET', `/channels/${user.channel_id}/messages`);
*/