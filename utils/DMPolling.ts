import { db } from "../bot";

interface QueueItem {
    userId: string;
    channelId: string; // the user's dm channel
    messageId: string;
    content: string;
    command: string | null;
    timestamp: number;
}

class DMPolling {
    // queue keys are user ids
    commandQueue = new Map<string, QueueItem>();
    messageQueue = new Map<string, QueueItem>();
    
    /**
     * Run a poll on DMs and assign it to the proper queue,
     * if it is to be assigned in any queue at all.
     * 
     * Respond with "command not found" for commands not found (messages starting with "/").
     */
    async pollDMs() {
        const users = db.prepare('SELECT * FROM users').all();
        
        for(const user of users) {

        }
    }

    /**
     * Execute the commands or transmit the messages in the queue
     */
    async execQueue() {

    }
}

/*
    functions needed:
    const user: any = await bot.api('POST', `/users/${userId}/dm`);
    const channel: any = await bot.api('GET', `/channels/${user.channel_id}/messages`);
*/