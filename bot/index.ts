import Database, { type Database as DB } from 'better-sqlite3';
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

// Open the database & export it for use across the project
export const db: DB = new Database('./db/database.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize db tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        active_ticket TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL UNIQUE,
        opened_by TEXT NOT NULL,
        claimed_by TEXT,
        status TEXT NOT NULL,
        server_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL UNIQUE,
        support_roles TEXT NOT NULL DEFAULT '[]',
        admin_roles TEXT NOT NULL DEFAULT '[]',
        tickets_panel TEXT NOT NULL DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

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