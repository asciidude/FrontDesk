import { db } from "../bot";

class DMPolling {
    /**
     * Run a poll on DMs and assign it to the proper queue,
     * if it is to be assigned in any queue at all.
     * 
     * Respond with "command not found" for commands not found (messages starting with "/").
     */
    async pollDMs() {
        const users = db.prepare('SELECT * FROM users').all();
        
        for(const user of users) {
            // queue user via DMQueue class (TODO)
        }
    }
}