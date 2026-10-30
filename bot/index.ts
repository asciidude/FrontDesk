import sqlite3, { open, type Database } from 'sqlite';
import { Bot } from '../dependencies/yapper';
import { checkPermissions } from '../utils/checkPermissions';
import { MessageSwitchboard } from '../utils/MessageSwitchboard';

if(
    process.env.NODE_ENV !== 'production'
    && process.env.NODE_ENV !== 'development')
    throw new Error('NODE_ENV must be either production or development')

const bot = new Bot(process.env.BOT_TOKEN!);
export const switchboard = new MessageSwitchboard(bot);

// used for /setup command so servers can't run 2 setups at once
export let activeSetups = new Map<string, {
    serverId: string,
    authorId: string,
    cancel?: () => void
}>();

await bot.loadCogs('./cogs');

export let db: Database;

(async () => {
    db = await open({
        filename: '/tmp/database.db',
        driver: sqlite3.Database
    });
});

bot.on('ready', () => {
    bot.setStatus('online', 'Checking for tickets...');
});

bot.on('interaction', async (i: any) => {
    if (i.custom_id === 'setup:cancel') {
        let currentSetup = activeSetups.get(i.server_id);
        if(!currentSetup || i.user_id !== currentSetup.authorId)
            return;

        await bot.emit('setup:cancel', {
            serverId: i.server_id,
            authorId: i.user_id
        });

        i.ack();
    }
});

bot.start().catch((e:any) => {
    // well shit
    console.error(`[ERR - Startup]: ${e.message}`);
    process.exit(1);
});