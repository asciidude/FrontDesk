import Database, { type Database as DB } from 'better-sqlite3';
import { Bot, Embed } from '../dependencies/yapper.js';
import { MessageSwitchboard } from '../utils/MessageSwitchboard';
import { createTicket } from '../utils/createTicket';
import { closeTicket } from '../utils/closeTicket.js';

if (
    process.env.NODE_ENV !== 'production'
    && process.env.NODE_ENV !== 'development')
    throw new Error('NODE_ENV must be either production or development')

const bot = new Bot(process.env.BOT_TOKEN!, {
    gateway: false,
    log: true
});

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
        max_open_tickets INTEGER NOT NULL DEFAULT 50,
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
        max_panels INTEGER NOT NULL DEFAULT 10, -- Premium unlocks 20
        max_open_tickets INTEGER NOT NULL DEFAULT 15, -- PER USER; not server.
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
    bot.setStatus('online', 'Looking for tickets...');

    // check every 5 seconds for channel deletion | TODO: stagger api calls
    setInterval(async () => {
        const servers: any[] = db.prepare(`
            SELECT server_id
            FROM servers
        `).all();

        for (const server of servers) {
            try {
                const tickets: any[] = db.prepare(`
                    SELECT ticket_id, channel_id
                    FROM tickets
                    WHERE server_id = ?
                `).all(server.server_id);

                if (!tickets.length) continue;

                const channels = await bot.channels(server.server_id);

                for (const ticket of tickets) {
                    const channelExists = channels.some(
                        (channel: any) => channel.id === ticket.channel_id
                    );

                    // if the channel was deleted, delete it from the database
                    if (!channelExists) {
                        await closeTicket(
                            bot,
                            server.server_id,
                            ticket.ticket_id,
                            'Closed by staff (channel delete)',
                            true
                        );

                        console.log(`[DEBUG] Ticket ${ticket.ticket_id} deleted.`)
                    }
                }
            } catch (e: any) {
                console.error(e);
            }
        }
    }, 5000);
});

bot.on('dm_message', (msg: any) => {
    // Transmit message (dms -> server) or "No ticket selected"
    if (msg.content.startsWith('/')) return;

    const userId = msg.author_id;
    const user: any = db.prepare(`
        SELECT *
        FROM users
        WHERE user_id = ?
    `).get(userId);

    if (!user) return;
    const activeTicket = user.active_ticket;

    if (!activeTicket) {
        bot.dmSend(userId, 'No ticket selected. View tickets with `/tickets`.');
        return;
    }

    const ticket: any = db.prepare(`
        SELECT *
        FROM tickets
        WHERE ticket_id = ?
    `).get(activeTicket);

    if (!ticket) {
        console.log(`[DEBUG] Active ticket ${activeTicket} not found, resetting user's active ticket.`);

        db.prepare(`
            UPDATE users
            SET active_ticket = NULL
            WHERE user_id = ?
            AND active_ticket = ?
        `).run(userId, activeTicket);

        bot.dmSend(userId, 'No ticket selected. View tickets with `/tickets`.');
        return;
    }

    if (ticket.status === 'closed') {
        db.prepare(`
            UPDATE users
            SET active_ticket = NULL
            WHERE user_id = ?
            AND active_ticket = ?
        `).run(userId, activeTicket);

        bot.dmSend(userId, 'Your selected ticket was closed. Subsequently, your active ticket has been cleared.\nUse \`/tickets\` to view your active tickets.');
        return;
    }

    bot.send(
        ticket.channel_id,
        `<@${userId}>: ${msg.content}`
    );
});

bot.on('message', async (msg: any) => {
    // Transmit message (server -> dms)
    const channel = await bot.channel(msg.channel_id);
    const server = await bot.server(channel.server_id);

    if (channel.name.startsWith('ticket-')) {
        const channelId = channel.id;

        const ticket: any = db.prepare(`
            SELECT *
            FROM tickets
            WHERE channel_id = ?
        `).get(channelId);

        if (!ticket) {
            msg.reply(`Ticket cannot be found not found - this channel may have failed to delete.\nPlease delete it or move it to your closed category.`);
            return;
        }

        const ticketId = ticket.ticket_id;

        const userId = ticket.opened_by;
        const user: any = db.prepare(`
            SELECT *
            FROM users
            WHERE user_id = ?
        `).get(userId);
        if (!user) return;

        if (user.active_ticket !== ticketId) {
            bot.dmSend(
                userId,
                `### SYSTEM MESSAGE\nYou have recieved a new message from **${server.name}** in ticket \`${ticketId}\`.\n\nSwitch to it using \`/switch ${ticketId}\` to see what was said.`
            );

            return;
        }

        if (ticket.status === 'closed') return;

        bot.dmSend(
            userId,
            `<@${msg.author_id}>: ${msg.content}\n-# From ${server.name} (ticket \`${ticketId}\`)`
        );
    }
});

bot.on('interaction', async (i: any) => {
    if (i.custom_id === 'setup:cancel') {
        let currentSetup = activeSetups.get(i.server_id);
        console.log(currentSetup);
        if (!currentSetup || i.user_id !== currentSetup.authorId)
            return;

        await bot.emit('setup:cancel', {
            serverId: i.server_id,
            authorId: i.user_id
        });

        i.ack();
    }

    if (i.custom_id.startsWith('tickets:open_')) {
        const userId = i.user_id;
        const serverId = i.server_id;

        const user: any = db.prepare(`
            SELECT *
            FROM users
            WHERE user_id = ?
        `).get(userId);

        const server: any = db.prepare(`
            SELECT *
            FROM servers
            WHERE server_id = ?
        `).get(serverId);

        if (!server) {
            i.ephemeral('This server could not be found in our database - please contact an admin immediately.');
            return;
        }

        // Check if the user has reached their maximum global or maximum server tickets
        if (user) {
            const userMax = user.max_open_tickets;
            const serverMax = server.max_open_tickets;

            const userCount: any = db.prepare(`
                SELECT COUNT(*) AS count
                FROM tickets
                WHERE opened_by = ?
                AND status != 'closed'
            `).get(userId);

            if (userCount.count >= userMax) {
                i.ephemeral(`You have reached your maximum global tickets (${userMax})`)
                return;
            }

            const serverCount: any = db.prepare(`
                SELECT COUNT(*) AS count
                FROM tickets
                WHERE server_id = ?
                AND opened_by = ?
                AND status != 'closed'
            `).get(serverId, userId);

            if (serverCount.count >= serverMax) {
                i.ephemeral(`You have reached your maximum tickets within this server (${serverMax})`)
                return;
            }
        }

        const serverInfo = await bot.server(serverId);
        const id = i.custom_id.slice('tickets:open_'.length);

        const ticketPanel: any = db.prepare(`
            SELECT *
            FROM ticket_panels
            WHERE message_id = ?
            AND server_id = ?
        `).get(id, serverId);

        if (!ticketPanel) {
            i.ephemeral('This ticket panel was not found within our database. Please ask a server admin to remove or replace it.');
            return;
        }

        try {
            let ticket;

            try {
                ticket = await createTicket(bot, userId, ticketPanel);
            } catch (e: any) {
                i.ephemeral(`I don't have the correct permissions! Please ping an admin and ask them to give me \`Manage Channels\`, \`Manage Server\`, and \`Mention Everyone\` permissions.`);
                return;
            }

            const ticketId = ticket.ticketId;
            const ticketEmbed = new Embed({
                title: ticketPanel.title,
                description:
                    ticketPanel.description
                    + `\n-# Opened in ${serverInfo.name} (ticket \`${ticketId}\`)`,
                color: ticketPanel.color,
                image: ticketPanel.thumbnail,
                footer: {
                    text: 'FrontDesk by asciixd',
                    icon_url: process.env.ICON_URL
                },
                timestamp: new Date()
            })

            if (!ticket.updatedUser && ticketId) {
                bot.dmSend(
                    userId,
                    `A new ticket has been opened. To switch to it, run \`/switch ${ticketId}\`.`,
                    {
                        embeds: [ ticketEmbed ]
                    }
                );
                
                i.ack();
            } else if (ticket.updatedUser && ticketId) {
                bot.dmSend(
                    userId,
                    `A new ticket has been opened, it has been automatically selected.\n\n-# **To view your active tickets,** use \`/tickets\`.`,
                    {
                        embeds: [ ticketEmbed ]
                    }
                );

                i.ack();
            }
        } catch (e: any) {
            console.error(e);
        }
    }
});

bot.start().catch((e: any) => {
    // well shit
    console.error(`[ERR - Startup]: ${e.message}`);
    process.exit(1);
});