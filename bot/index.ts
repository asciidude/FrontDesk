import Database, { type Database as DB } from 'better-sqlite3';
import { Bot, Embed } from '../dependencies/yapper.js';
import { checkPermissions } from '../utils/checkPermissions';
import { MessageSwitchboard } from '../utils/MessageSwitchboard';
import { createTicket } from '../utils/createTicket';

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
        active_ticket TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (active_ticket)
            REFERENCES tickets(ticket_id)
            ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL UNIQUE,
        opened_by TEXT NOT NULL,
        claimed_by TEXT,
        status TEXT NOT NULL
            CHECK (status IN ('open', 'claimed', 'closed')),
        server_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (server_id)
            REFERENCES servers(server_id)
    );

    CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL UNIQUE,
        support_roles TEXT NOT NULL DEFAULT '[]',
        admin_roles TEXT NOT NULL DEFAULT '[]',
        open_ticket_category TEXT NOT NULL,
        closed_ticket_category TEXT NOT NULL,
        auto_delete_tickets INTEGER NOT NULL DEFAULT 120, -- 120 hours / 5 days
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ticket_panels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        color TEXT,
        thumbnail_url TEXT,

        FOREIGN KEY (server_id)
            REFERENCES servers(server_id)
            ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_tickets_server
    ON tickets(server_id);

    CREATE INDEX IF NOT EXISTS idx_tickets_user
    ON tickets(opened_by);

    CREATE INDEX IF NOT EXISTS idx_panels_server
    ON ticket_panels(server_id);
`);

bot.on('ready', async () => {
    bot.setStatus('online', 'Checking for tickets...');
});

bot.on('dm_message', (msg: any) => {
    if(!msg.content?.trim()) return; // only parse valid messages
    const args = msg.content.split(/\s+/);
    if(args[0].startsWith('/')) {
        // Parse command as and execute cog, if no cog found, reply with "command not found"
        const commandName = args[0].slice(1);
        const command = bot.cogs.get(commandName);
        
        if(!command || command.serverOnly) {
            bot.dmSend(msg.author_id, `Command \`/${commandName}\` not found or the command is exclusively for servers.`);
            return;
        }

        command.run(); // TODO
    } else {
        // Transmit message to active ticket. If no ticket is selected, reply with "ticket not found"
        // TODO
    }
});

bot.on('interaction', async (i: any) => {
    console.log(i.custom_id, i);

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

    if (i.custom_id.startsWith('tickets:open_')) {
        const id = i.custom_id.slice('tickets:open_'.length);
        const userId = i.user_id;

        const ticketPanel: any = db.prepare(`
            SELECT *
            FROM ticket_panels
            WHERE message_id = ?
        `).get(id);

        if(!ticketPanel) return;

        try {
            let ticket;
            
            try {
                ticket = await createTicket(bot, ticketPanel.server_id, userId);
            } catch(e:any) {
                i.ephemeral(`I don't have the correct permissions! Please ping an admin and ask them to give me \`Manage Channels\`, \`Manage Server\`, and \`Mention Everyone\` permissions.`);
                return;
            }

            if(!ticket.updatedUser && ticket.ticketId) {
                bot.dmSend(
                    userId,
                    `A new ticket has been opened. To switch to it, run \`/switch ${ticket.ticketId}\`.`,
                    {
                        embeds: [
                            new Embed({
                                title: ticketPanel.title,
                                description: ticketPanel.description,
                                color: ticketPanel.color,
                                image: ticketPanel.thumbnail,
                                footer: {
                                    text: 'FrontDesk by asciixd',
                                    icon_url: process.env.ICON_URL
                                },
                                timestamp: new Date()
                            })
                        ]
                    }
                );

                i.ack();
            } else if(ticket.updatedUser && ticket.ticketId) {
                bot.dmSend(
                    userId,
                    `A new ticket has been opened, it has been automatically selected.\n\n-# **To switch tickets,** please use \`/switch (ticket ID)\`.\n-# **To view tickets (and their IDs),** do \`/tickets\`.`,
                    {
                        embeds: [
                            new Embed({
                                title: ticketPanel.title,
                                description: ticketPanel.description,
                                color: ticketPanel.color,
                                image: ticketPanel.thumbnail,
                                footer: {
                                    text: 'FrontDesk by asciixd',
                                    icon_url: process.env.ICON_URL
                                },
                                timestamp: new Date()
                            })
                        ]
                    }
                );

                i.ack();
            }
        } catch(e: any) {
            console.error(e);
        }
    }
});

// check delete channel, if it is a ticket channel search for that ticket id (extract from ticket-tid)
// then delete ticket with deleteTicket util

bot.start().catch((e:any) => {
    // well shit
    console.error(`[ERR - Startup]: ${e.message}`);
    process.exit(1);
});